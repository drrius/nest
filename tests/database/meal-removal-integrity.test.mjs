import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { mealWeekFiles } from "./meal-week-files.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of mealWeekFiles) db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const add = (n, source = null) => `insert into public.meal_plan_entries
  (id,household_id,date,slot,title_snapshot,leftover_of_entry_id)
  values('${id(n)}','${id(10)}','${source ? "2026-10-05" : "2026-09-28"}',null,'Meal',${source ? `'${id(source)}'` : "null"})`;
const remove = (n) => `update public.meal_plan_entries set removed_at=now() where id='${id(n)}'`;
const restore = (n) => `update public.meal_plan_entries set removed_at=null where id='${id(n)}'`;
// Reproduce retained legacy inconsistency before installing the additive guard.
db.sql(`${add(300)}; ${add(301, 300)}; ${remove(300)}`);
const legacyBefore = db.sql(
  "select jsonb_agg(to_jsonb(e) order by id) from public.meal_plan_entries e",
);
db.file("supabase/migrations/20260920202549_native_meal_removal_integrity.sql");
const legacyAfter = db.sql(
  "select jsonb_agg(to_jsonb(e) order by id) from public.meal_plan_entries e",
);
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
test("source removal is rejected across weeks, history survives and restoration revalidates", () => {
  db.sql(`${add(200)}; ${add(201, 200)}`);
  const before = db.sql(
    "select jsonb_agg(to_jsonb(r) order by week_start) from public.nest_meal_week_revisions r",
  );
  assert.throws(() => db.sql(remove(200)), /Remove active leftovers/);
  assert.equal(
    db.sql(
      "select jsonb_agg(to_jsonb(r) order by week_start) from public.nest_meal_week_revisions r",
    ),
    before,
  );
  db.sql(`${remove(201)}; ${remove(200)}`);
  assert.throws(() => db.sql(restore(201)), /source has been removed/);
  db.sql(`${restore(200)}; ${restore(201)}`);
  assert.equal(
    db.sql(
      `select count(*) from public.meal_plan_entries where id in ('${id(200)}','${id(201)}') and removed_at is null`,
    ),
    "2",
  );
});
test("source removal waits for an in-flight legacy child insertion and then rejects", async () => {
  db.sql(add(210));
  const child = db.concurrent(
    `set application_name='child-first'; begin; ${add(211, 210)}; select pg_sleep(0.7); commit`,
  );
  await waitFor("child-first", "PgSleep");
  const removal = db.concurrent(`set application_name='removal-second'; ${remove(210)}`);
  const rejected = assert.rejects(removal, /Remove active leftovers/);
  await waitFor("removal-second", "transactionid");
  await child;
  await rejected;
});
test("legacy child insertion waits for source removal and rejects its committed state", async () => {
  db.sql(add(220));
  const removal = db.concurrent(
    `set application_name='removal-first'; begin; ${remove(220)}; select pg_sleep(0.7); commit`,
  );
  await waitFor("removal-first", "PgSleep");
  const child = db.concurrent(`set application_name='child-second'; ${add(221, 220)}`);
  const rejected = assert.rejects(child, /source has been removed/);
  await waitFor("child-second", "transactionid");
  await removal;
  await rejected;
});
test("restoring a child serializes against source removal", async () => {
  db.sql(`${add(230)}; ${add(231, 230)}; ${remove(231)}`);
  const child = db.concurrent(
    `set application_name='restore-first'; begin; ${restore(231)}; select pg_sleep(0.7); commit`,
  );
  await waitFor("restore-first", "PgSleep");
  const removal = db.concurrent(`set application_name='remove-restored'; ${remove(230)}`);
  const rejected = assert.rejects(removal, /Remove active leftovers/);
  await waitFor("remove-restored", "transactionid");
  await child;
  await rejected;
});

test("a restored child cannot outlive a concurrently removed source", async () => {
  db.sql(`${add(240)}; ${add(241, 240)}; ${remove(241)}`);
  const removal = db.concurrent(
    `set application_name='remove-before-restore'; begin; ${remove(240)}; select pg_sleep(0.7); commit`,
  );
  await waitFor("remove-before-restore", "PgSleep");
  const child = db.concurrent(`set application_name='restore-after-remove'; ${restore(241)}`);
  const rejected = assert.rejects(child, /source has been removed/);
  await waitFor("restore-after-remove", "transactionid");
  await removal;
  await rejected;
});

test("restoration checks updated dates and source kind; invalid transactions roll back", () => {
  db.sql(`${add(250)}; ${add(251, 250)}; ${remove(251)}`);
  db.sql(`update public.meal_plan_entries set date='2026-10-12' where id='${id(250)}'`);
  assert.throws(() => db.sql(restore(251)), /source must be earlier/);
  db.sql(add(252));
  db.sql(
    `update public.meal_plan_entries set leftover_of_entry_id='${id(252)}' where id='${id(250)}'`,
  );
  assert.throws(() => db.sql(restore(251)), /leftover cannot reference another leftover/);
  const before = db.sql(
    `select row_to_json(e) from public.meal_plan_entries e where id='${id(252)}'`,
  );
  assert.throws(
    () =>
      db.sql(
        `begin; update public.meal_plan_entries set title_snapshot='Must roll back' where id='${id(252)}'; ${remove(252)}; commit`,
      ),
    /Remove active leftovers/,
  );
  assert.equal(
    db.sql(`select row_to_json(e) from public.meal_plan_entries e where id='${id(252)}'`),
    before,
  );
  assert.equal(
    db.sql(
      "select has_function_privilege('authenticated','private.nest_guard_meal_source_removal()','EXECUTE')",
    ),
    "f",
  );
  assert.equal(
    db.sql(
      "select has_function_privilege('anon','private.nest_guard_meal_source_removal()','EXECUTE')",
    ),
    "f",
  );
});

test("installation preserves existing orphan history and permits explicitly removing that leftover", () => {
  assert.equal(legacyAfter, legacyBefore);
  db.sql(remove(301));
  assert.equal(
    db.sql(
      `select count(*) from public.meal_plan_entries where id in ('${id(300)}','${id(301)}') and removed_at is not null`,
    ),
    "2",
  );
  assert.throws(() => db.sql(restore(301)), /source has been removed/);
});

test("source removal fails closed under a repeatable transaction snapshot", () => {
  db.sql(add(310));
  assert.throws(
    () =>
      db.sql(
        `begin isolation level repeatable read; select count(*) from public.meal_plan_entries; ${remove(310)}; commit`,
      ),
    /fresh read-committed transaction/,
  );
  assert.equal(
    db.sql(`select removed_at is null from public.meal_plan_entries where id='${id(310)}'`),
    "t",
  );
});
