import test from "node:test";
import assert from "node:assert/strict";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { legacyApiFenceSql } from "../../tools/migration/legacy-api-fence.mjs";
import { captureLegacyWriterInventory } from "../../tools/migration/writer-inventory.mjs";

test("API fence refuses inherited grants and reversibly restricts legacy access", (t) => {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.sql(`create role anon; create role authenticated; create role service_role;
    create role inherited_writer; grant inherited_writer to authenticated;
    create function public.legacy_write() returns void language sql as $$select$$;
    revoke all on function public.legacy_write() from public;
    grant execute on function public.legacy_write() to inherited_writer,anon;
    create table public.legacy_table(id int);
    grant update(id) on public.legacy_table to authenticated;
    grant truncate on public.legacy_table to service_role;
    create function public.nest_read() returns int language sql as $$select 1$$;
    revoke all on function public.nest_read() from public;
    grant execute on function public.nest_read() to authenticated;`);
  const before = captureLegacyWriterInventory(db);
  assert.throws(
    () => db.sql(`begin; ${legacyApiFenceSql()} rollback;`),
    /Legacy function still executable/,
  );
  assert.deepEqual(captureLegacyWriterInventory(db), before);
  db.sql(`revoke execute on function public.legacy_write() from inherited_writer;
    grant update(id) on public.legacy_table to inherited_writer;`);
  assert.throws(
    () => db.sql(`begin; ${legacyApiFenceSql()} rollback;`),
    /Legacy table still writable/,
  );
  db.sql(`revoke update(id) on public.legacy_table from inherited_writer;`);
  const original = captureLegacyWriterInventory(db);
  assert.equal(
    db.sql(`begin; ${legacyApiFenceSql()}
    set local role authenticated;
    do $probe$ begin
      begin perform public.legacy_write(); raise exception 'RPC fence bypassed';
      exception when insufficient_privilege then null; end;
      begin update public.legacy_table set id=1; raise exception 'Table fence bypassed';
      exception when insufficient_privilege then null; end;
    end $probe$;
    select public.nest_read(); rollback;`),
    "1",
  );
  assert.deepEqual(captureLegacyWriterInventory(db), original);
});
