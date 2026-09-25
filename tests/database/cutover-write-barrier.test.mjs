import assert from "node:assert/strict";
import test from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import {
  installFixtureWriteBarrier,
  setFixtureWritesFrozen,
} from "../../tools/migration/write-barrier-fixture.mjs";

function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.sql(`create schema private;
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.fixture_history(id integer primary key);
    create table private.fixture_receipts(id integer primary key);
    grant usage on schema private to authenticated;
    grant select,insert,update,delete,truncate on public.fixture_history,private.fixture_receipts to authenticated;`);
  installFixtureWriteBarrier(db);
  return db;
}

async function waitFor(db, condition) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    if (db.sql(`select exists(select 1 from pg_stat_activity where ${condition})`) === "t") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`Expected database wait: ${condition}`);
}

test("fixture freeze drains an open write transaction, then preserves reads and refuses later writes", async (t) => {
  const db = fixture(t);
  const writing = db.concurrent(`set application_name='nest-barrier-writer'; set role authenticated;
    begin; insert into public.fixture_history values(1); insert into private.fixture_receipts values(1);
    select pg_sleep(3); commit;`);
  await waitFor(db, "application_name='nest-barrier-writer' and wait_event='PgSleep'");
  const freezing = db.concurrent(`set application_name='nest-barrier-freezer';
    set lock_timeout='8s'; set statement_timeout='9s';
    update private.nest_fixture_write_control set frozen=true where singleton;`);
  await waitFor(db, "application_name='nest-barrier-freezer' and wait_event_type='Lock'");
  await Promise.all([writing, freezing]);
  for (const table of ["public.fixture_history", "private.fixture_receipts"]) {
    assert.equal(db.sql(`set role authenticated; select count(*) from ${table}`), "1");
    for (const sql of [
      `insert into ${table} values(2)`,
      `update ${table} set id=2`,
      `delete from ${table}`,
      `truncate ${table}`,
    ])
      assert.throws(
        () => db.sql(`set role authenticated; ${sql}`),
        /Fixture household writes suspended/,
      );
  }
  setFixtureWritesFrozen(db, false);
  db.sql("set role authenticated; insert into public.fixture_history values(2)");
  assert.equal(db.sql("select count(*) from public.fixture_history"), "2");
});

test("API roles cannot change the freeze and missing control fails closed", (t) => {
  const db = fixture(t);
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(
      () => db.sql(`set role ${role}; update private.nest_fixture_write_control set frozen=false`),
      /permission denied/,
    );
  db.sql("delete from private.nest_fixture_write_control");
  assert.throws(
    () => db.sql("insert into public.fixture_history values(1)"),
    /Fixture household writes suspended/,
  );
  assert.throws(() => setFixtureWritesFrozen(db, false), /Fixture write control missing/);
});

for (const isolation of ["read committed", "repeatable read"]) {
  test(`a previously started ${isolation} transaction cannot begin writing after freeze`, async (t) => {
    const db = fixture(t);
    const outcome = db
      .concurrent(`set application_name='nest-late-barrier-writer';
      begin isolation level ${isolation}; set local role authenticated;
      select count(*) from public.fixture_history; select pg_sleep(3);
      insert into public.fixture_history values(1); commit;`)
      .then(
        () => ({ failed: false, message: "" }),
        (error) => ({ failed: true, message: String(error.stderr ?? error.message) }),
      );
    await waitFor(db, "application_name='nest-late-barrier-writer' and wait_event='PgSleep'");
    setFixtureWritesFrozen(db, true);
    const result = await outcome;
    assert.equal(result.failed, true);
    assert.match(
      result.message,
      isolation === "read committed"
        ? /Fixture household writes suspended/
        : /could not serialize access/,
    );
    assert.equal(db.sql("select count(*) from public.fixture_history"), "0");
  });
}
