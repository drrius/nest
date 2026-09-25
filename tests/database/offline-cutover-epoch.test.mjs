import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { installFixtureWriteBarrier } from "../../tools/migration/write-barrier-fixture.mjs";

function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.sql(`create schema private;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.fixture_history(id integer primary key);
    insert into public.fixture_history values(1);`);
  installFixtureWriteBarrier(db);
  db.sql(
    readFileSync("supabase/migrations/20260925202107_native_offline_cutover_epoch.sql", "utf8"),
  );
  return db;
}

test("offline epoch rotation requires a freeze and never grants API roles control", (t) => {
  const db = fixture(t);
  const original = db.sql("select offline_epoch from private.nest_household_write_control");
  db.sql(`select private.nest_require_offline_epoch('${original}')`);
  assert.throws(() => db.sql("select private.nest_rotate_offline_epoch()"), /Freeze household/);
  db.sql("select private.nest_require_offline_epoch(null)");
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.throws(
      () => db.sql(`set role ${role}; select private.nest_rotate_offline_epoch()`),
      /permission denied/,
    );
    assert.throws(
      () =>
        db.sql(`set role ${role}; select offline_epoch from private.nest_household_write_control`),
      /permission denied/,
    );
  }
  db.sql("select private.nest_set_household_writes_frozen(true)");
  const rotated = db.sql("select private.nest_rotate_offline_epoch()");
  assert.notEqual(rotated, original);
  assert.throws(
    () => db.sql(`select private.nest_require_offline_epoch('${rotated}')`),
    /Household writes suspended/,
  );
  db.sql("select private.nest_set_household_writes_frozen(false)");
  assert.throws(() => db.sql("select private.nest_require_offline_epoch(null)"), /reconciliation/);
  assert.throws(
    () => db.sql(`select private.nest_require_offline_epoch('${original}')`),
    /reconciliation/,
  );
  db.sql(`select private.nest_require_offline_epoch('${rotated}')`);
  assert.equal(db.sql("select count(*) from public.fixture_history"), "1");
  db.sql("delete from private.nest_household_write_control");
  assert.throws(
    () => db.sql(`select private.nest_require_offline_epoch('${rotated}')`),
    /Household writes suspended/,
  );
});

test("a command epoch lock drains before freeze and rotation can commit", async (t) => {
  const db = fixture(t);
  const epoch = db.sql("select offline_epoch from private.nest_household_write_control");
  const writing = db.concurrent(`set application_name='nest-epoch-writer'; begin;
    select private.nest_require_offline_epoch('${epoch}');
    select pg_sleep(3); insert into public.fixture_history values(2); commit;`);
  await waitFor(db, "application_name='nest-epoch-writer' and wait_event='PgSleep'");
  const rotating = db.concurrent(`set application_name='nest-epoch-rotation';
    set lock_timeout='8s'; set statement_timeout='9s'; begin;
    select private.nest_set_household_writes_frozen(true);
    select private.nest_rotate_offline_epoch(); commit;`);
  await waitFor(db, "application_name='nest-epoch-rotation' and wait_event_type='Lock'");
  await Promise.all([writing, rotating]);
  assert.equal(db.sql("select count(*) from public.fixture_history"), "2");
  assert.notEqual(db.sql("select offline_epoch from private.nest_household_write_control"), epoch);
  db.sql("select private.nest_set_household_writes_frozen(false)");
  assert.throws(
    () =>
      db.sql(`begin; select private.nest_require_offline_epoch('${epoch}');
      insert into public.fixture_history values(3); commit;`),
    /reconciliation/,
  );
  assert.equal(db.sql("select count(*) from public.fixture_history"), "2");
});

async function waitFor(db, condition) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if (db.sql(`select exists(select 1 from pg_stat_activity where ${condition})`) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Expected database wait: ${condition}`);
}
