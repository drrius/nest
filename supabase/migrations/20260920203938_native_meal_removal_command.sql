-- GATED candidate: retain meal and preparation history; no grocery/money writes.
create table public.nest_meal_removal_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_meal_removal_receipts enable row level security;
revoke all on public.nest_meal_removal_receipts from public,anon,authenticated,service_role;
grant select on public.nest_meal_removal_receipts to authenticated;
create policy own_meal_removal_receipts on public.nest_meal_removal_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_meal_removal_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_keys text[]:=array['entryId','weekStart','expectedRevision']; v_key text; v_revision bigint;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>1024 then
    raise exception 'Invalid meal removal' using errcode='22023';
  end if;
  if not(p_input ?& v_keys) or p_input-v_keys<>'{}'::jsonb then
    raise exception 'Invalid meal removal' using errcode='22023';
  end if;
  foreach v_key in array v_keys loop
    if jsonb_typeof(p_input->v_key) is distinct from 'string' then
      raise exception 'Invalid meal removal' using errcode='22023';
    end if;
  end loop;
  if p_input->>'entryId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_input->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'Invalid meal removal' using errcode='22023';
  end if;
  v_revision:=(p_input->>'expectedRevision')::bigint;
  perform private.nest_meal_placement_dates(p_input->>'weekStart',p_input->>'weekStart');
exception when numeric_value_out_of_range then
  raise exception 'Invalid meal removal' using errcode='22023';
end;
$$;
revoke all on function private.nest_meal_removal_input(jsonb) from public,anon,authenticated,service_role;

-- Caller owns the week lock and has authorized current household membership.
-- Keep the entry lock through preparation inspection to serialize legacy creation.
create function private.nest_remove_meal_entry(p_household uuid,p_entry uuid,p_week date)
returns uuid language plpgsql set search_path='' as $$
declare v_entry public.meal_plan_entries; v_preparation uuid;
begin
  select * into v_entry from public.meal_plan_entries
    where household_id=p_household and id=p_entry for update;
  if not found or v_entry.removed_at is not null or v_entry.date not between p_week and p_week+6 then
    raise exception 'Meal week changed' using errcode='40001';
  end if;
  update public.meal_plan_entries set removed_at=clock_timestamp() where id=p_entry;
  select id into v_preparation from public.routine_occurrences
    where household_id=p_household and meal_plan_entry_id=p_entry and status='open' and role='current'
    for update;
  if found then
    perform private.apply_routine_closure(v_preparation,'nest:meal-remove:'||gen_random_uuid()::text,
      'skip',null,null,null,null);
  end if;
  return v_preparation;
end;
$$;
revoke all on function private.nest_remove_meal_entry(uuid,uuid,date) from public,anon,authenticated,service_role;

create function private.nest_remove_meal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_meal_removal_receipts;
  v_week date; v_revision bigint; v_preparation uuid; v_result jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid meal operation' using errcode='22023'; end if;
  perform private.nest_meal_removal_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:meal-remove:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(p_input::text,'UTF8'));
  select * into v_prior from public.nest_meal_removal_receipts
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
  v_preparation:=private.nest_remove_meal_entry(p_household,(p_input->>'entryId')::uuid,v_week);
  select revision into v_revision from public.nest_meal_week_revisions
    where household_id=p_household and week_start=v_week;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'entryId',p_input->>'entryId','weekStart',p_input->>'weekStart',
    'revision',v_revision::text,'removed',true,'skippedPreparationId',v_preparation);
  insert into public.nest_meal_removal_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when check_violation or unique_violation or lock_not_available or deadlock_detected then
  raise exception 'Meal week changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_remove_meal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_remove_meal(uuid,uuid,jsonb) to authenticated;
create function public.nest_remove_meal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_remove_meal($1,$2,$3);
$$;
revoke all on function public.nest_remove_meal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_remove_meal(uuid,uuid,jsonb) to authenticated;
