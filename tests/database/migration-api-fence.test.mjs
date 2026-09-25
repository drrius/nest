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

test("API fence blocks owner-backed writable views while preserving reads and rollback", (t) => {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.sql(`create role anon; create role authenticated; create role service_role;
    create table public.legacy_source(id int);
    insert into public.legacy_source values (1);
    create view public.legacy_edit as select id from public.legacy_source;
    grant select,insert,update,delete on public.legacy_edit to authenticated;
    set role authenticated;
    update public.legacy_edit set id=2;
    reset role;`);
  assert.equal(db.sql("select id from public.legacy_source"), "2");
  assert.equal(
    db.sql(`begin; ${legacyApiFenceSql()}
    set local role authenticated;
    do $probe$ begin
      begin update public.legacy_edit set id=3; raise exception 'View fence bypassed';
      exception when insufficient_privilege then null; end;
      begin insert into public.legacy_edit values(4); raise exception 'View insert bypassed';
      exception when insufficient_privilege then null; end;
      begin delete from public.legacy_edit; raise exception 'View delete bypassed';
      exception when insufficient_privilege then null; end;
    end $probe$;
    select id from public.legacy_edit; rollback;`),
    "2",
  );
  db.sql("set role authenticated; update public.legacy_edit set id=5;");
  assert.equal(db.sql("select id from public.legacy_source"), "5");
});

test("API fence blocks legacy procedure calls and refuses surviving inherited execution", (t) => {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.sql(`create role anon; create role authenticated; create role service_role;
    create role procedure_caller; grant procedure_caller to authenticated;
    create table public.procedure_result(id int);
    create procedure public.legacy_post() language sql security definer
      set search_path='' as $$insert into public.procedure_result values(1)$$;
    revoke all on procedure public.legacy_post() from public;
    grant execute on procedure public.legacy_post() to procedure_caller;
    set role authenticated; call public.legacy_post(); reset role;`);
  assert.equal(db.sql("select count(*) from public.procedure_result"), "1");
  assert.throws(
    () => db.sql(`begin; ${legacyApiFenceSql()} rollback;`),
    /Legacy function still executable/,
  );
  db.sql(`revoke execute on procedure public.legacy_post() from procedure_caller;
    grant execute on procedure public.legacy_post() to authenticated;`);
  assert.equal(
    db.sql(`begin; ${legacyApiFenceSql()}
    set local role authenticated;
    do $probe$ begin
      begin call public.legacy_post(); raise exception 'Procedure fence bypassed';
      exception when insufficient_privilege then null; end;
    end $probe$;
    reset role;
    select count(*) from public.procedure_result; rollback;`),
    "1",
  );
  db.sql("set role authenticated; call public.legacy_post();");
  assert.equal(db.sql("select count(*) from public.procedure_result"), "2");
});
