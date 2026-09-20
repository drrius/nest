-- GATED additive candidate. Explicitly requested one-off meals only; no grocery materialization.
-- A zero row can now serialize the first native writer to an untouched legacy week.
alter table public.nest_meal_week_revisions drop constraint nest_meal_week_revisions_revision_check;
alter table public.nest_meal_week_revisions add constraint nest_meal_week_revisions_revision_check check(revision>=0);

create table public.nest_meal_placement_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_meal_placement_receipts enable row level security;
revoke all on public.nest_meal_placement_receipts from public,anon,authenticated,service_role;
grant select on public.nest_meal_placement_receipts to authenticated;
create policy own_meal_placement_receipts on public.nest_meal_placement_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_meal_placement_dates(p_week text,p_date text)
returns void language plpgsql immutable set search_path='' as $$
declare v_week date; v_date date;
begin
  if p_week !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid meal placement' using errcode='22023';
  end if;
  v_week:=p_week::date; v_date:=p_date::date;
  if v_week<date '0001-01-01' or v_week>date '9999-12-20' or extract(isodow from v_week)<>1
    or to_char(v_week,'YYYY-MM-DD')<>p_week or to_char(v_date,'YYYY-MM-DD')<>p_date
    or v_date not between v_week and v_week+6 then
    raise exception 'Invalid meal placement' using errcode='22023';
  end if;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Invalid meal placement' using errcode='22023';
end;
$$;
revoke all on function private.nest_meal_placement_dates(text,text) from public,anon,authenticated,service_role;

create function private.nest_meal_placement_title(p_title text)
returns void language plpgsql immutable set search_path='' as $$
begin
  if length(p_title)+(select count(*) from regexp_split_to_table(p_title,'') c where ascii(c)>65535)>120
    or btrim(p_title,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' then
    raise exception 'Invalid meal title' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.nest_meal_placement_title(text) from public,anon,authenticated,service_role;

create function private.nest_meal_placement_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_keys text[]:=array['weekStart','expectedRevision','date','slot','title'];
  v_key text; v_revision bigint;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>8192 then
    raise exception 'Invalid meal placement' using errcode='22023';
  end if;
  if not(p_input ?& v_keys) or p_input-v_keys<>'{}'::jsonb then
    raise exception 'Invalid meal placement' using errcode='22023';
  end if;
  foreach v_key in array v_keys loop
    if jsonb_typeof(p_input->v_key) is distinct from 'string' then
      raise exception 'Invalid meal placement' using errcode='22023';
    end if;
  end loop;
  if p_input->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,18})$'
    or p_input->>'slot' not in ('breakfast','lunch','dinner') then
    raise exception 'Invalid meal placement' using errcode='22023';
  end if;
  v_revision:=(p_input->>'expectedRevision')::bigint;
  perform private.nest_meal_placement_dates(p_input->>'weekStart',p_input->>'date');
  perform private.nest_meal_placement_title(p_input->>'title');
exception when numeric_value_out_of_range then
  raise exception 'Invalid meal placement' using errcode='22023';
end;
$$;
revoke all on function private.nest_meal_placement_input(jsonb) from public,anon,authenticated,service_role;

create function private.nest_place_meal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_meal_placement_receipts;
  v_week date; v_revision bigint; v_entry uuid; v_result jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid meal operation' using errcode='22023'; end if;
  perform private.nest_meal_placement_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:meal-place:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(p_input::text,'UTF8'));
  select * into v_prior from public.nest_meal_placement_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Meal operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  v_week:=(p_input->>'weekStart')::date;
  insert into public.nest_meal_week_revisions(household_id,week_start,revision)
    values(p_household,v_week,0) on conflict(household_id,week_start) do nothing;
  select revision into v_revision from public.nest_meal_week_revisions
    where household_id=p_household and week_start=v_week for update;
  if v_revision<>(p_input->>'expectedRevision')::bigint then
    raise exception 'Meal week changed' using errcode='40001';
  end if;
  if exists(select 1 from public.meal_plan_entries where household_id=p_household
    and date=(p_input->>'date')::date and slot=p_input->>'slot' and removed_at is null) then
    raise exception 'Meal slot occupied' using errcode='40001';
  end if;
  insert into public.meal_plan_entries(household_id,date,slot,title_snapshot)
    values(p_household,(p_input->>'date')::date,p_input->>'slot',p_input->>'title') returning id into v_entry;
  select revision into v_revision from public.nest_meal_week_revisions
    where household_id=p_household and week_start=v_week;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'entryId',v_entry,'weekStart',p_input->>'weekStart',
    'date',p_input->>'date','slot',p_input->>'slot','revision',v_revision::text);
  insert into public.nest_meal_placement_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when unique_violation or lock_not_available or deadlock_detected then
  raise exception 'Meal week changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_place_meal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_place_meal(uuid,uuid,jsonb) to authenticated;
create function public.nest_place_meal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_place_meal($1,$2,$3);
$$;
revoke all on function public.nest_place_meal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_place_meal(uuid,uuid,jsonb) to authenticated;
