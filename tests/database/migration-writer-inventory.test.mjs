import test from "node:test";
import assert from "node:assert/strict";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { captureLegacyWriterInventory } from "../../tools/migration/writer-inventory.mjs";

test("cutover inventory includes anonymous, inherited, column-only and truncate-only access", (t) => {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.sql(`create role anon; create role authenticated; create role service_role;
    create role legacy_writer; grant legacy_writer to authenticated;
    create function public.legacy_anonymous() returns void language sql as $$select$$;
    revoke all on function public.legacy_anonymous() from public;
    grant execute on function public.legacy_anonymous() to anon;
    create function public.legacy_inherited() returns void language sql as $$select$$;
    revoke all on function public.legacy_inherited() from public;
    grant execute on function public.legacy_inherited() to legacy_writer;
    create table public.legacy_truncate(id int);
    grant truncate on public.legacy_truncate to service_role;
    create table public.legacy_column(id int, note text);
    grant update(note) on public.legacy_column to authenticated;
    create table public.legacy_partition(id int) partition by range(id);
    grant insert on public.legacy_partition to anon;
    create table public.legacy_readonly(id int);
    grant select on public.legacy_readonly to authenticated;
    create table public.nest_native(id int);
    grant insert on public.nest_native to authenticated;`);
  const result = captureLegacyWriterInventory(db);
  assert.deepEqual(result.legacyCallableFunctions, [
    {
      signature: "legacy_anonymous()",
      securityDefiner: false,
      anonymous: true,
      authenticated: false,
      serviceRole: false,
    },
    {
      signature: "legacy_inherited()",
      securityDefiner: false,
      anonymous: false,
      authenticated: true,
      serviceRole: false,
    },
  ]);
  assert.deepEqual(result.legacyWritableTables, [
    {
      table: "legacy_column",
      rls: false,
      anonymous: false,
      authenticated: true,
      serviceRole: false,
    },
    {
      table: "legacy_partition",
      rls: false,
      anonymous: true,
      authenticated: false,
      serviceRole: false,
    },
    {
      table: "legacy_truncate",
      rls: false,
      anonymous: false,
      authenticated: false,
      serviceRole: true,
    },
  ]);
  assert.equal(result.cutoverVerified, false);
});
