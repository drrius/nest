import test from "node:test";
import assert from "node:assert/strict";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { captureTableAccessInventory } from "../../tools/migration/table-access-inventory.mjs";

test("table inventory distinguishes inherited column grants, schema access and actual RLS denial", (t) => {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.sql(`create role anon; create role authenticated; create role service_role;
    create role member_reader; grant member_reader to authenticated;
    create schema private; create schema storage;
    create table private.notes(id int,body text);
    insert into private.notes values(1,'private');
    grant select(body) on private.notes to member_reader;
    create table public.items(id int);
    insert into public.items values(1);
    alter table public.items enable row level security;
    grant select on public.items to authenticated;
    create policy blocked on public.items for select to authenticated using(false);
    create table storage.objects(id int);
    grant truncate on storage.objects to service_role;`);
  const rows = captureTableAccessInventory(db);
  const notes = rows.find((row) => row.schema === "private" && row.table === "notes");
  const member = notes.roles.find((row) => row.role === "authenticated");
  assert.deepEqual(member, {
    role: "authenticated",
    schemaUsage: false,
    select: true,
    insert: false,
    update: false,
    delete: false,
    truncate: false,
  });
  assert.throws(
    () => db.sql("set role authenticated; select body from private.notes"),
    /permission denied for schema/,
  );
  db.sql("grant usage on schema private to member_reader");
  assert.equal(db.sql("set role authenticated; select body from private.notes"), "private");
  const items = rows.find((row) => row.schema === "public" && row.table === "items");
  assert.equal(items.rls, true);
  assert.equal(items.policies, 1);
  assert.equal(items.roles.find((row) => row.role === "authenticated").select, true);
  assert.equal(db.sql("set role authenticated; select count(*) from public.items"), "0");
  const objects = rows.find((row) => row.schema === "storage");
  assert.equal(objects.roles.find((row) => row.role === "service_role").truncate, true);
  assert.equal(objects.roles.find((row) => row.role === "anon").truncate, false);
});
