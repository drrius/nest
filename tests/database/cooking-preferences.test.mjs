import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/conversation-fixture.sql");
db.file("supabase/migrations/20260920050551_native_cooking_preferences.sql");
beforeEach(() =>
  db.sql(
    "delete from public.nest_cooking_preferences; delete from public.nest_cooking_preference_receipts",
  ),
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
const command = (
  operation = id(100),
  revision = 0,
  notes = "'Quick weeknight meals'",
  slots = "array['dinner']",
) =>
  `select public.nest_save_cooking_preferences('${id(10)}','${operation}',${revision},${notes},${slots})`;
const save = (sql = command(), actor) => JSON.parse(db.sql(as(sql, actor)));
const count = (table) => db.sql(`select count(*) from public.${table}`);

test("both equal members read shared cooking choices while receipts remain actor-bound", () => {
  assert.equal(db.sql(as("select count(*) from public.nest_cooking_preferences")), "0");
  const first = save();
  assert.equal(first.actorId, id(1));
  assert.equal(first.revision, "1");
  assert.equal(
    db.sql(as("select cooking_notes from public.nest_cooking_preferences", id(2))),
    "Quick weeknight meals",
  );
  assert.equal(
    db.sql(as("select count(*) from public.nest_cooking_preference_receipts", id(2))),
    "0",
  );
  const partner = save(command(id(100), 1, "'Cook together'", "array['lunch','dinner']"), id(2));
  assert.equal(partner.actorId, id(2));
  assert.equal(partner.revision, "2");
  assert.equal(
    db.sql(as("select cooking_notes from public.nest_cooking_preferences")),
    "Cook together",
  );
  assert.deepEqual(save(), first);
  assert.equal(count("nest_cooking_preference_receipts"), "2");
});

test("outsiders and anonymous callers cannot read, mutate or bypass command grants", () => {
  save();
  assert.equal(db.sql(as("select count(*) from public.nest_cooking_preferences", id(3))), "0");
  assert.throws(() => save(command(), id(3)), /Not authorized/);
  assert.throws(() => db.sql(`set role anon; ${command()}`), /permission denied/);
  assert.throws(
    () => db.sql("set role anon; select * from public.nest_cooking_preferences"),
    /permission denied/,
  );
  assert.throws(
    () => db.sql(as("update public.nest_cooking_preferences set revision=99")),
    /permission denied/,
  );
  assert.throws(
    () => db.sql(as("delete from public.nest_cooking_preference_receipts")),
    /permission denied/,
  );
});

test("exact retries remain immutable and stale partner edits cannot overwrite current settings", () => {
  const first = save();
  assert.deepEqual(save(), first);
  assert.throws(() => save(command(id(100), 0, "'Changed operation'")), /operation changed/);
  assert.throws(() => save(command(id(101), 0), id(2)), /preferences changed/);
  save(command(id(101), 1, "''", "array['breakfast']"), id(2));
  assert.deepEqual(save(), first);
  assert.equal(db.sql("select revision from public.nest_cooking_preferences"), "2");
});

test("concurrent duplicates and competing partner first saves cannot create lost updates", async () => {
  const attempts = await Promise.all(Array.from({ length: 6 }, () => db.concurrent(as(command()))));
  const receipts = attempts.map((value) => JSON.parse(value.stdout));
  for (const receipt of receipts) assert.deepEqual(receipt, receipts[0]);
  assert.equal(count("nest_cooking_preference_receipts"), "1");
  db.sql(
    "delete from public.nest_cooking_preferences; delete from public.nest_cooking_preference_receipts",
  );
  const outcomes = await Promise.allSettled([
    db.concurrent(as(command())),
    db.concurrent(as(command(id(101), 0, "'Partner choice'"), id(2))),
  ]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(
    String(outcomes.find((result) => result.status === "rejected").reason),
    /Cooking preferences changed/,
  );
  assert.equal(count("nest_cooking_preference_receipts"), "1");
  assert.equal(count("nest_cooking_preferences"), "1");
});

test("slot sets are nonempty, unique and finite; notes share JavaScript UTF-16 bounds", () => {
  for (const slots of [
    "null",
    "array[]::text[]",
    "array['dinner','dinner']",
    "array['snack']",
    "array[null]::text[]",
    "array[['dinner']]",
  ])
    assert.throws(() => save(command(id(100), 0, "''", slots)), /Invalid cooking preferences/);
  for (const notes of ["null", "repeat('a',2001)", "repeat('🥜',1001)"])
    assert.throws(() => save(command(id(100), 0, notes)), /Invalid cooking preferences/);
  assert.equal(count("nest_cooking_preferences"), "0");
  assert.equal(
    save(command(id(100), 0, "repeat('🥜',1000)", "array['breakfast','lunch','dinner']")).revision,
    "1",
  );
});

test("receipt failure rolls back shared settings instead of leaving an unacknowledged revision", () => {
  db.sql(
    "create function private.fixture_cooking_receipt_failure() returns trigger language plpgsql as $$ begin raise exception 'fixture receipt failure'; end $$; create trigger fixture_cooking_receipt before insert on public.nest_cooking_preference_receipts for each row execute function private.fixture_cooking_receipt_failure()",
  );
  try {
    assert.throws(() => save(), /fixture receipt failure/);
  } finally {
    db.sql(
      "drop trigger fixture_cooking_receipt on public.nest_cooking_preference_receipts; drop function private.fixture_cooking_receipt_failure()",
    );
  }
  assert.equal(count("nest_cooking_preferences"), "0");
  assert.equal(count("nest_cooking_preference_receipts"), "0");
  assert.equal(save().revision, "1");
});

test("revoked membership hides shared settings and prevents even saved-operation replay", () => {
  save();
  db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  try {
    assert.equal(db.sql(as("select count(*) from public.nest_cooking_preferences")), "0");
    assert.throws(() => save(), /Not authorized/);
    assert.throws(() => save(command(id(101), 1)), /Not authorized/);
    assert.equal(count("nest_cooking_preferences"), "1");
  } finally {
    db.sql(
      `insert into public.household_members(household_id,user_id,display_name) values('${id(10)}','${id(1)}','First')`,
    );
  }
});

test("membership revocation waits for an in-flight authorized cooking save", async (t) => {
  const saving = db.concurrent(
    as(
      `set application_name='nest-cooking-save'; begin; ${command()}; select pg_sleep(0.3); commit;`,
    ),
  );
  let waiting = false;
  for (let n = 0; n < 30; n++) {
    waiting =
      db.sql(
        "select count(*) from pg_stat_activity where application_name='nest-cooking-save' and wait_event='PgSleep'",
      ) === "1";
    if (waiting) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(waiting, true);
  t.after(() =>
    db.sql(
      `insert into public.household_members(household_id,user_id,display_name) values('${id(10)}','${id(1)}','First') on conflict do nothing`,
    ),
  );
  const revoke = db.concurrent(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(1)}'`,
  );
  await Promise.all([saving, revoke]);
  assert.equal(count("nest_cooking_preference_receipts"), "1");
  assert.equal(db.sql(as("select count(*) from public.nest_cooking_preferences")), "0");
  assert.throws(() => save(), /Not authorized/);
});
