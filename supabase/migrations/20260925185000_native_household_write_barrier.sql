-- GATED: database-only recovery control. Default-open; deployment/activation need approval.
-- Covers the currently audited public/private tables, not Auth/Storage, DDL or external work.
create table private.nest_household_write_control (
  singleton boolean primary key check(singleton),
  frozen boolean not null default false
);
insert into private.nest_household_write_control values(true,false);
alter table private.nest_household_write_control enable row level security;
revoke all on private.nest_household_write_control from public,anon,authenticated,service_role;

create function private.nest_household_write_barrier() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_frozen boolean;
begin
  select frozen into v_frozen from private.nest_household_write_control where singleton for share;
  if v_frozen is distinct from false then
    -- Explicit PostgREST 503: maintenance must not become an offline item conflict.
    raise exception 'Household writes suspended' using errcode='PT503';
  end if;
  return null;
end;
$$;
revoke all on function private.nest_household_write_barrier() from public,anon,authenticated,service_role;

do $install$ declare v_table record; begin
  for v_table in select c.oid::regclass as relation from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind in ('r','p')
      and c.oid<>'private.nest_household_write_control'::regclass order by c.oid loop
    execute format('create trigger nest_household_write_barrier before insert or update or delete or truncate on %s for each statement execute function private.nest_household_write_barrier()',v_table.relation);
    execute format('alter table %s enable always trigger nest_household_write_barrier',v_table.relation);
  end loop;
end; $install$;

create function private.nest_assert_household_write_barrier() returns void
language plpgsql security definer set search_path='' as $$
declare v_missing text;
begin
  select string_agg(c.oid::regclass::text,', ' order by c.oid) into v_missing
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind in ('r','p')
      and c.oid<>'private.nest_household_write_control'::regclass
      and not exists(select 1 from pg_trigger t where t.tgrelid=c.oid
        and t.tgname='nest_household_write_barrier' and not t.tgisinternal
        and t.tgenabled='A' and t.tgtype=62
        and t.tgfoid='private.nest_household_write_barrier()'::regprocedure);
  if v_missing is not null then
    raise exception 'Household write barrier missing or changed: %',v_missing using errcode='55000';
  end if;
end;
$$;
revoke all on function private.nest_assert_household_write_barrier() from public,anon,authenticated,service_role;

-- One trusted operator, with concurrent DDL stopped. The transaction must commit.
-- UPDATE waits for protected writers; lock/deadlock timeout means no acknowledged freeze.
-- This does not reconcile pending clients, revoke old APIs, or pause external dispatch.
create function private.nest_set_household_writes_frozen(p_frozen boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_frozen is null then raise exception 'Freeze state required' using errcode='22023'; end if;
  perform private.nest_assert_household_write_barrier();
  update private.nest_household_write_control set frozen=p_frozen where singleton;
  if not found then raise exception 'Household write control missing' using errcode='55000'; end if;
end;
$$;
revoke all on function private.nest_set_household_writes_frozen(boolean) from public,anon,authenticated,service_role;
