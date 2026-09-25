// Disposable-cluster experiment only. No hosted URL or production activation command.
// Covers existing ordinary/partitioned public/private tables, not Auth/Storage or DDL.
export function installFixtureWriteBarrier(db) {
  db.sql(`create table private.nest_fixture_write_control(
      singleton boolean primary key check(singleton), frozen boolean not null);
    insert into private.nest_fixture_write_control values(true,false);
    alter table private.nest_fixture_write_control enable row level security;
    revoke all on private.nest_fixture_write_control from public,anon,authenticated,service_role;
    create function private.nest_fixture_write_barrier() returns trigger
    language plpgsql security definer set search_path='' as $barrier$
    declare v_frozen boolean;
    begin
      select frozen into v_frozen from private.nest_fixture_write_control where singleton for share;
      if v_frozen is distinct from false then
        raise exception 'Fixture household writes suspended' using errcode='55000';
      end if;
      return null;
    end; $barrier$;
    revoke all on function private.nest_fixture_write_barrier() from public,anon,authenticated,service_role;
    do $install$ declare v_table record; begin
      for v_table in select c.oid::regclass as relation from pg_class c
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('public','private') and c.relkind in ('r','p')
          and c.oid<>'private.nest_fixture_write_control'::regclass order by c.oid loop
        execute format('create trigger nest_fixture_write_barrier before insert or update or delete or truncate on %s for each statement execute function private.nest_fixture_write_barrier()',v_table.relation);
        execute format('alter table %s enable always trigger nest_fixture_write_barrier',v_table.relation);
      end loop;
    end; $install$;`);
}

export function setFixtureWritesFrozen(db, frozen) {
  if (typeof frozen !== "boolean") throw new Error("Explicit fixture freeze state required");
  db.sql(`do $freeze$ begin
    update private.nest_fixture_write_control set frozen=${frozen} where singleton;
    if not found then raise exception 'Fixture write control missing'; end if;
    end; $freeze$;`);
}

export function verifyFixtureWriteBarrier(db) {
  const missing = JSON.parse(
    db.sql(`select coalesce(jsonb_agg(c.oid::regclass::text order by c.oid),'[]')
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind in ('r','p')
      and c.oid<>'private.nest_fixture_write_control'::regclass
      and not exists(select 1 from pg_trigger t where t.tgrelid=c.oid
        and t.tgname='nest_fixture_write_barrier' and not t.tgisinternal
        and t.tgenabled='A' and t.tgtype=62
        and t.tgfoid='private.nest_fixture_write_barrier()'::regprocedure)`),
  );
  if (missing.length)
    throw new Error(`Fixture write barrier missing or changed: ${missing.join(", ")}`);
}
