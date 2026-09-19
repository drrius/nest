-- Additive to audited Household OS tenancy; never a fresh-project bootstrap.
do $$
begin
  if to_regclass('public.household_members') is null
    or to_regnamespace('private') is null
    or to_regprocedure('auth.uid()') is null then
    raise exception 'Nest requires the existing Household OS tenancy baseline; do not apply to an empty project'
      using errcode='55000';
  end if;
end;
$$;

-- GATED: consent-bound sanitized busy snapshots. No calendar/event text is stored.
create table public.nest_calendar_consent (
  actor_id uuid not null, household_id uuid not null,
  enabled boolean not null default false, version bigint not null default 0,
  generation bigint not null default 0, capture_started_at timestamptz,
  last_operation uuid, last_expected bigint, last_enabled boolean,
  primary key(actor_id,household_id),
  foreign key(household_id,actor_id) references public.household_members(household_id,user_id) on delete cascade
);
create table public.nest_busy_snapshots (
  actor_id uuid not null, household_id uuid not null,
  schema_version integer not null default 1 check(schema_version=1),
  consent_version bigint not null, generation bigint not null,
  covered_start bigint not null, covered_end bigint not null,
  intervals jsonb not null, captured_at timestamptz not null, expires_at timestamptz not null,
  primary key(actor_id,household_id),
  foreign key(actor_id,household_id) references public.nest_calendar_consent(actor_id,household_id) on delete cascade
);
alter table public.nest_calendar_consent enable row level security;
alter table public.nest_busy_snapshots enable row level security;
revoke all on public.nest_calendar_consent, public.nest_busy_snapshots from public, anon, authenticated;
grant select on public.nest_calendar_consent, public.nest_busy_snapshots to authenticated;

create function private.nest_calendar_member(p_household uuid) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  perform 1 from public.household_members
    where user_id=v_actor and household_id=p_household for key share;
  if v_actor is null or not found then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  return v_actor;
end;
$$;
revoke all on function private.nest_calendar_member(uuid) from public, anon, authenticated;

create function private.nest_busy_visible(p_household uuid,p_actor uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists(select 1 from public.household_members where household_id=p_household and user_id=auth.uid())
    and exists(select 1 from public.household_members where household_id=p_household and user_id=p_actor)
    and exists(select 1 from public.nest_calendar_consent where household_id=p_household and actor_id=p_actor and enabled);
$$;
revoke all on function private.nest_busy_visible(uuid,uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.nest_busy_visible(uuid,uuid) to authenticated;
create policy own_calendar_consent on public.nest_calendar_consent for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.household_id=nest_calendar_consent.household_id and m.user_id=(select auth.uid())));
create policy shared_busy_snapshot on public.nest_busy_snapshots for select to authenticated
  using(expires_at > clock_timestamp() and private.nest_busy_visible(household_id,actor_id));

create function private.nest_set_calendar_consent(
  p_household uuid,p_operation uuid,p_expected bigint,p_enabled boolean
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.nest_calendar_member(p_household);
  v_row public.nest_calendar_consent;
begin
  if p_operation is null or p_expected is null or p_expected < 0 or p_enabled is null then
    raise exception 'Invalid consent request' using errcode='22023';
  end if;
  insert into public.nest_calendar_consent(actor_id,household_id) values(v_actor,p_household)
    on conflict do nothing;
  select * into strict v_row from public.nest_calendar_consent
    where actor_id=v_actor and household_id=p_household for update;
  if v_row.last_operation=p_operation then
    if v_row.last_expected is distinct from p_expected or v_row.last_enabled is distinct from p_enabled then
      raise exception 'Consent operation changed' using errcode='22023';
    end if;
    return v_row.version::text;
  end if;
  if v_row.version <> p_expected then
    raise exception 'Consent changed' using errcode='40001';
  end if;
  update public.nest_calendar_consent set enabled=p_enabled, version=version+1,
    generation=generation+1,capture_started_at=null,last_operation=p_operation,
    last_expected=p_expected,last_enabled=p_enabled
    where actor_id=v_actor and household_id=p_household returning * into v_row;
  delete from public.nest_busy_snapshots where actor_id=v_actor and household_id=p_household;
  return v_row.version::text;
end;
$$;

create function private.nest_begin_busy_capture(p_household uuid,p_consent bigint)
  returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.nest_calendar_member(p_household);
  v_row public.nest_calendar_consent;
begin
  select * into v_row from public.nest_calendar_consent
    where actor_id=v_actor and household_id=p_household for update;
  if not found or not v_row.enabled or v_row.version is distinct from p_consent then
    raise exception 'Calendar sharing changed' using errcode='40001';
  end if;
  update public.nest_calendar_consent set generation=generation+1,capture_started_at=clock_timestamp()
    where actor_id=v_actor and household_id=p_household returning * into v_row;
  return jsonb_build_object('consent',v_row.version::text,'generation',v_row.generation::text,
    'capturedAt',v_row.capture_started_at,'expiresAt',v_row.capture_started_at+interval '15 minutes');
end;
$$;

create function private.nest_validate_busy_coverage(p_start bigint,p_end bigint)
  returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_start is null or p_end is null or p_start < 0 or p_end > 253402300799999
    or p_end <= p_start or p_end::numeric-p_start::numeric > 2678400000 then
    raise exception 'Invalid busy coverage' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.nest_validate_busy_coverage(bigint,bigint) from public,anon,authenticated;

create function private.nest_validate_busy(p_start bigint,p_end bigint,p_intervals jsonb)
  returns void language plpgsql security invoker set search_path = '' as $$
declare v_item jsonb; v_from numeric; v_to numeric; v_previous numeric;
begin
  perform private.nest_validate_busy_coverage(p_start,p_end);
  v_previous := p_start-1;
  if jsonb_typeof(p_intervals) is distinct from 'array' then
    raise exception 'Invalid busy intervals' using errcode='22023';
  end if;
  if jsonb_array_length(p_intervals)>512 then
    raise exception 'Too many busy intervals' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_intervals) loop
    perform private.nest_validate_busy_interval(v_item);
    v_from := (v_item->>'start')::numeric; v_to := (v_item->>'end')::numeric;
    if v_from < p_start or v_to > p_end or v_from <= v_previous then
      raise exception 'Busy intervals must be ordered, disjoint and covered' using errcode='22023';
    end if;
    v_previous := v_to;
  end loop;
end;
$$;

create function private.nest_validate_busy_interval(p_item jsonb) returns void
  language plpgsql security invoker set search_path = '' as $$
declare v_start numeric; v_end numeric;
begin
  if jsonb_typeof(p_item) is distinct from 'object' then
    raise exception 'Invalid busy interval' using errcode='22023';
  end if;
  if p_item - 'start' - 'end' <> '{}'::jsonb
    or jsonb_typeof(p_item->'start') is distinct from 'number'
    or jsonb_typeof(p_item->'end') is distinct from 'number' then
    raise exception 'Busy intervals allow only start and end' using errcode='22023';
  end if;
  v_start := (p_item->>'start')::numeric; v_end := (p_item->>'end')::numeric;
  if trunc(v_start) <> v_start or trunc(v_end) <> v_end or v_start >= v_end then
    raise exception 'Invalid busy interval bounds' using errcode='22023';
  end if;
end;
$$;

create function private.nest_publish_busy(
  p_household uuid,p_consent bigint,p_generation bigint,p_start bigint,p_end bigint,p_intervals jsonb
) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.nest_calendar_member(p_household);
  v_consent public.nest_calendar_consent;
  v_snapshot public.nest_busy_snapshots;
  v_expiry timestamptz;
begin
  select * into v_consent from public.nest_calendar_consent
    where actor_id=v_actor and household_id=p_household for update;
  if not found or not v_consent.enabled or v_consent.version is distinct from p_consent
    or v_consent.generation is distinct from p_generation or v_consent.capture_started_at is null then
    raise exception 'Busy capture superseded' using errcode='40001';
  end if;
  v_expiry := v_consent.capture_started_at+interval '15 minutes';
  if v_expiry <= clock_timestamp() then
    raise exception 'Busy capture expired' using errcode='40001';
  end if;
  perform private.nest_validate_busy(p_start,p_end,p_intervals);
  select * into v_snapshot from public.nest_busy_snapshots
    where actor_id=v_actor and household_id=p_household;
  if found and v_snapshot.generation=p_generation then
    if (v_snapshot.covered_start,v_snapshot.covered_end,v_snapshot.intervals)
      is distinct from (p_start,p_end,p_intervals) then
      raise exception 'Published capture changed' using errcode='22023';
    end if;
    return v_snapshot.expires_at;
  end if;
  insert into public.nest_busy_snapshots(actor_id,household_id,consent_version,generation,
    covered_start,covered_end,intervals,captured_at,expires_at)
    values(v_actor,p_household,p_consent,p_generation,p_start,p_end,p_intervals,v_consent.capture_started_at,v_expiry)
    on conflict(actor_id,household_id) do update set consent_version=excluded.consent_version,
      generation=excluded.generation,covered_start=excluded.covered_start,covered_end=excluded.covered_end,
      intervals=excluded.intervals,captured_at=excluded.captured_at,expires_at=excluded.expires_at;
  return v_expiry;
end;
$$;

revoke all on function private.nest_set_calendar_consent(uuid,uuid,bigint,boolean) from public,anon,authenticated;
revoke all on function private.nest_begin_busy_capture(uuid,bigint) from public,anon,authenticated;
revoke all on function private.nest_validate_busy(bigint,bigint,jsonb) from public,anon,authenticated;
revoke all on function private.nest_validate_busy_interval(jsonb) from public,anon,authenticated;
revoke all on function private.nest_publish_busy(uuid,bigint,bigint,bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function private.nest_set_calendar_consent(uuid,uuid,bigint,boolean) to authenticated;
grant execute on function private.nest_begin_busy_capture(uuid,bigint) to authenticated;
grant execute on function private.nest_publish_busy(uuid,bigint,bigint,bigint,bigint,jsonb) to authenticated;
create function public.nest_set_calendar_consent(p_household uuid,p_operation uuid,p_expected bigint,p_enabled boolean)
  returns text language sql security invoker set search_path='' as $$
  select private.nest_set_calendar_consent($1,$2,$3,$4);
$$;
create function public.nest_begin_busy_capture(p_household uuid,p_consent bigint)
  returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_begin_busy_capture($1,$2);
$$;
create function public.nest_publish_busy(p_household uuid,p_consent bigint,p_generation bigint,p_start bigint,p_end bigint,p_intervals jsonb)
  returns timestamptz language sql security invoker set search_path='' as $$
  select private.nest_publish_busy($1,$2,$3,$4,$5,$6);
$$;
revoke all on function public.nest_set_calendar_consent(uuid,uuid,bigint,boolean) from public,anon,authenticated;
revoke all on function public.nest_begin_busy_capture(uuid,bigint) from public,anon,authenticated;
revoke all on function public.nest_publish_busy(uuid,bigint,bigint,bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.nest_set_calendar_consent(uuid,uuid,bigint,boolean) to authenticated;
grant execute on function public.nest_begin_busy_capture(uuid,bigint) to authenticated;
grant execute on function public.nest_publish_busy(uuid,bigint,bigint,bigint,bigint,jsonb) to authenticated;
