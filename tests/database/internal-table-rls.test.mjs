import assert from "node:assert/strict";
import test from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import {
  internalRLSTables as tables,
  verifyInternalTableRLS,
} from "../../tools/migration/internal-table-rls.mjs";
const migration = "supabase/migrations/20261006160244_native_internal_rls.sql";

function fixture(t) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.sql(`create schema private;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema private to anon,authenticated,service_role;`);
  for (const name of tables) {
    db.sql(`create table private.${name}(id int primary key, payload jsonb not null);
      insert into private.${name} values(1,'{"household":"A","receipt":"private A"}'),
        (2,'{"household":"B","receipt":"private B"}');`);
  }
  const snapshot = () =>
    tables.map((name) => db.sql(`select jsonb_agg(t order by id) from private.${name} t`));
  return { db, snapshot };
}

test("internal rows remain private even after accidental client row-access grants", (t) => {
  const { db, snapshot } = fixture(t);
  const before = snapshot();
  db.file(migration);
  for (const name of tables) {
    db.sql(`grant select,insert,update,delete on private.${name} to anon,authenticated`);
    for (const role of ["anon", "authenticated"]) {
      assert.equal(db.sql(`set role ${role}; select count(*) from private.${name}`), "0");
      assert.equal(
        db.sql(`set role ${role}; with changed as (
          update private.${name} set payload='{}' returning id) select count(*) from changed`),
        "0",
      );
      assert.equal(
        db.sql(`set role ${role}; with changed as (
          delete from private.${name} returning id) select count(*) from changed`),
        "0",
      );
      assert.throws(
        () => db.sql(`set role ${role}; insert into private.${name} values(3,'{}')`),
        /row-level security/,
      );
    }
  }
  assert.deepEqual(snapshot(), before);
});

test("enabling internal RLS preserves existing grants, rows and trusted owner access", (t) => {
  const { db, snapshot } = fixture(t);
  const before = snapshot();
  const privileges = () =>
    db.sql(`select jsonb_agg(jsonb_build_array(relname,relacl) order by relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'`);
  const grants = privileges();
  db.file(migration);
  db.file(migration);
  assert.equal(verifyInternalTableRLS(db).passed, true);
  assert.deepEqual(snapshot(), before);
  assert.equal(privileges(), grants);
  for (const name of tables) {
    assert.equal(db.sql(`select count(*) from private.${name}`), "2");
    assert.throws(
      () => db.sql(`set role authenticated; select * from private.${name}`),
      /permission denied/,
    );
    db.sql(`grant select on private.${name} to service_role`);
    assert.equal(db.sql(`set role service_role; select count(*) from private.${name}`), "2");
  }
});
