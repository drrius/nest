import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { createRequire } from "node:module";
import { MealWeekSnapshot } from "../../packages/contracts/src/meals.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const decode = Schema.decodeUnknownSync(MealWeekSnapshot);
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { mealWeekFiles } from "./meal-week-files.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of mealWeekFiles) db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
const read = (week = "2026-09-21", actor = id(1)) =>
  decode(
    JSON.parse(db.sql(as(`select public.nest_meal_week_snapshot('${id(10)}','${week}')`, actor))),
    { onExcessProperty: "error" },
  );
const revision = (week = "2026-09-21") => read(week).revision;
const insert = (
  n,
  date,
  slot = "lunch",
) => `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot)
  values('${id(n)}','${id(10)}','${date}',${slot === null ? "null" : `'${slot}'`},'Meal ${n}')`;

test("legacy data reads at revision zero; tenant access and counter writes are restricted", () => {
  assert.equal(revision(), "0");
  assert.deepEqual(
    read().entries.map((meal) => meal.entryId),
    [id(100)],
  );
  assert.equal(read("2026-09-21", id(2)).entries[0].title, "Legacy soup");
  assert.throws(() => read("2026-09-21", id(3)), /Not authorized/);
  assert.throws(
    () => db.sql(`set role anon; select public.nest_meal_week_snapshot('${id(10)}','2026-09-21')`),
    /permission denied/,
  );
  assert.equal(
    db.sql(as(`select count(*) from public.meal_plan_entries where household_id='${id(20)}'`)),
    "0",
  );
  assert.throws(
    () =>
      db.sql(as(`insert into public.nest_meal_week_revisions values('${id(10)}','2026-09-21',1)`)),
    /permission denied/,
  );
  assert.throws(() => db.sql(as(`select private.nest_advance_meal_weeks()`)), /permission denied/);
  assert.throws(
    () => db.sql(as(`update public.meal_plan_entries set title_snapshot='Forged'`)),
    /permission denied/,
  );
});

test("same-transaction ABA edits advance monotonically even when legacy timestamps match", () => {
  db.sql(`begin; update public.meal_plan_entries set title_snapshot='Changed' where id='${id(100)}';
    create temporary table previous_stamp as select updated_at from public.meal_plan_entries where id='${id(100)}';
    update public.meal_plan_entries set title_snapshot='Legacy soup' where id='${id(100)}';
    do $$ begin if (select updated_at from previous_stamp)<>(select updated_at from public.meal_plan_entries where id='${id(100)}') then
      raise exception 'Legacy timestamp unexpectedly changed'; end if; end $$; commit;`);
  assert.equal(revision(), "2");
  assert.equal(read().entries[0].title, "Legacy soup");
});

test("moves touch both weeks; ideas, removal and rollback never silently reset a generation", () => {
  db.sql(insert(102, "2026-09-22"));
  assert.equal(revision(), "3");
  db.sql(`update public.meal_plan_entries set date='2026-09-29' where id='${id(102)}'`);
  assert.equal(revision(), "4");
  assert.equal(revision("2026-09-28"), "1");
  db.sql(
    `begin; update public.meal_plan_entries set removed_at=now() where id='${id(102)}'; rollback;`,
  );
  assert.equal(revision("2026-09-28"), "1");
  assert.equal(read("2026-09-28").entries.length, 1);
  db.sql(`update public.meal_plan_entries set removed_at=now() where id='${id(102)}'`);
  assert.equal(revision("2026-09-28"), "2");
  assert.equal(read("2026-09-28").entries.length, 0);
  db.sql(insert(103, "2026-09-28", null));
  assert.equal(revision("2026-09-28"), "3");
  assert.equal(read("2026-09-28").entries.length, 0);
  db.sql(`delete from public.meal_plan_entries where id='${id(103)}'`);
  assert.equal(revision("2026-09-28"), "4");
});

test("concurrent independent entry writes cannot lose revision increments", async () => {
  const before = BigInt(revision());
  await Promise.all([
    db.concurrent(insert(104, "2026-09-23")),
    db.concurrent(insert(105, "2026-09-24")),
  ]);
  assert.equal(BigInt(revision()), before + 2n);
  assert.deepEqual(
    read().entries.map((meal) => meal.entryId),
    [id(100), id(104), id(105)],
  );
});

test("snapshot sees one revision/content pair when a write commits during a blocked read", async () => {
  const before = read();
  const holder = db.concurrent(`set application_name='meal-holder'; begin;
    select pg_advisory_xact_lock(7561); select pg_sleep(0.8); commit;`);
  await waitFor("meal-holder", "PgSleep");
  const reading = db.concurrent(
    as(`set application_name='meal-reader';
    with barrier as materialized(select pg_advisory_xact_lock(7561))
    select public.nest_meal_week_snapshot('${id(10)}','2026-09-21') from barrier`),
  );
  await waitFor("meal-reader", "advisory");
  db.sql(`update public.meal_plan_entries set title_snapshot='Fresh soup' where id='${id(100)}'`);
  await holder;
  assert.deepEqual(JSON.parse((await reading).stdout.trim()), before);
  const fresh = read();
  assert.equal(BigInt(fresh.revision), BigInt(before.revision) + 1n);
  assert.equal(fresh.entries[0].title, "Fresh soup");
});

async function waitFor(application, event) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      db.sql(
        `select count(*) from pg_stat_activity where application_name='${application}' and wait_event='${event}'`,
      ) === "1"
    )
      return;
    await setTimeout(5);
  }
  assert.fail(`Missing barrier ${application}/${event}`);
}

test("canonical complete-week bounds, all 21 slots and exact bigint revisions survive reads", () => {
  for (const week of [
    "2026-09-22",
    "2026-02-30",
    "0000-01-01",
    "9999-12-27",
    "2026-09-21\n",
    "2026-9-21",
  ]) {
    assert.throws(() => read(week), /Invalid meal week/);
  }
  assert.deepEqual(read("0001-01-01").entries, []);
  assert.deepEqual(read("9999-12-20").entries, []);
  db.sql(`insert into public.meal_plan_entries(household_id,date,slot,title_snapshot)
    select '${id(10)}',date '2026-10-05'+day,slot,'Full board'
    from generate_series(0,6) day cross join (values('breakfast'),('lunch'),('dinner')) slots(slot)`);
  const full = read("2026-10-05");
  assert.equal(full.entries.length, 21);
  assert.equal(full.revision, "21");
  assert.deepEqual(
    full.entries.slice(0, 3).map((entry) => entry.slot),
    ["breakfast", "lunch", "dinner"],
  );
  db.sql(`update public.nest_meal_week_revisions set revision=9223372036854775807
    where household_id='${id(10)}' and week_start='2026-10-05'`);
  assert.equal(revision("2026-10-05"), "9223372036854775807");
  assert.throws(
    () =>
      db.sql(`update public.meal_plan_entries set title_snapshot='Must roll back'
    where household_id='${id(10)}' and date='2026-10-05' and slot='dinner'`),
    /bigint out of range/,
  );
  assert.deepEqual(read("2026-10-05"), { ...full, revision: "9223372036854775807" });
});

test("revision rows remain tenant scoped after population and membership revocation", () => {
  assert.equal(
    db.sql(
      as(
        `select count(*) from public.nest_meal_week_revisions where household_id='${id(10)}'`,
        id(3),
      ),
    ),
    "0",
  );
  assert.throws(
    () => db.sql(as(`update public.nest_meal_week_revisions set revision=1`)),
    /permission denied/,
  );
  assert.throws(
    () => db.sql(as(`delete from public.nest_meal_week_revisions`)),
    /permission denied/,
  );
  db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  assert.throws(() => read("2026-09-21", id(2)), /Not authorized/);
  assert.equal(db.sql(as(`select count(*) from public.nest_meal_week_revisions`, id(2))), "0");
});

test("household cascade does not recreate counters or obstruct authorized administrative removal", () => {
  db.sql(
    `update public.meal_plan_entries set title_snapshot='Other changed' where id='${id(101)}'`,
  );
  assert.equal(
    db.sql(`select count(*) from public.nest_meal_week_revisions where household_id='${id(20)}'`),
    "1",
  );
  db.sql(`delete from public.households where id='${id(20)}'`);
  assert.equal(
    db.sql(`select count(*) from public.nest_meal_week_revisions where household_id='${id(20)}'`),
    "0",
  );
});
