-- GATED candidate: retain meal and preparation history; no grocery/money writes.
create table public.nest_meal_move_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_meal_move_receipts enable row level security;
revoke all on public.nest_meal_move_receipts from public,anon,authenticated,service_role;
grant select on public.nest_meal_move_receipts to authenticated;
create policy own_meal_move_receipts on public.nest_meal_move_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_meal_move_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_keys text[]:=array['entryId','sourceWeekStart','targetWeekStart','expectedSourceRevision','expectedTargetRevision','date','slot']; v_key text; v_revision bigint;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>2048 then
    raise exception 'Invalid meal move' using errcode='22023';
  end if;
  if not(p_input ?& v_keys) or p_input-v_keys<>'{}'::jsonb then
    raise exception 'Invalid meal move' using errcode='22023';
  end if;
  foreach v_key in array v_keys loop
    if jsonb_typeof(p_input->v_key) is distinct from 'string' then
      raise exception 'Invalid meal move' using errcode='22023';
    end if;
  end loop;
  if p_input->>'entryId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_input->>'slot' not in ('breakfast','lunch','dinner') then
    raise exception 'Invalid meal move' using errcode='22023';
  end if;
  foreach v_key in array array['expectedSourceRevision','expectedTargetRevision'] loop
    if p_input->>v_key !~ '^(0|[1-9][0-9]{0,18})$' then raise exception 'Invalid meal revision' using errcode='22023'; end if;
    v_revision:=(p_input->>v_key)::bigint;
  end loop;
  perform private.nest_meal_placement_dates(p_input->>'sourceWeekStart',p_input->>'sourceWeekStart');
  perform private.nest_meal_placement_dates(p_input->>'targetWeekStart',p_input->>'date');
  if p_input->>'sourceWeekStart'=p_input->>'targetWeekStart'
    and p_input->>'expectedSourceRevision'<>p_input->>'expectedTargetRevision' then
    raise exception 'Invalid meal baselines' using errcode='22023';
  end if;
exception when numeric_value_out_of_range then raise exception 'Invalid meal revision' using errcode='22023';
end;
$$;
revoke all on function private.nest_meal_move_input(jsonb) from public,anon,authenticated,service_role;

create function private.nest_move_meal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_meal_move_receipts;
  v_source date; v_target date; v_week date; v_revision bigint; v_result jsonb;
  v_entry public.meal_plan_entries; v_source_revision bigint; v_target_revision bigint;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid meal operation' using errcode='22023'; end if;
  perform private.nest_meal_move_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:meal-move:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(p_input::text,'UTF8'));
  select * into v_prior from public.nest_meal_move_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Meal operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Meal week changed' using errcode='40001';
  end if;
  v_source:=(p_input->>'sourceWeekStart')::date; v_target:=(p_input->>'targetWeekStart')::date;
  for v_week in select distinct w from unnest(array[v_source,v_target]) w order by w loop
    insert into public.nest_meal_week_revisions values(p_household,v_week,0) on conflict do nothing;
    select revision into v_revision from public.nest_meal_week_revisions
      where household_id=p_household and week_start=v_week for update;
    if v_revision<>(case when v_week=v_source then p_input->>'expectedSourceRevision' else p_input->>'expectedTargetRevision' end)::bigint then
      raise exception 'Meal week changed' using errcode='40001';
    end if;
  end loop;
  select * into v_entry from public.meal_plan_entries where household_id=p_household and id=(p_input->>'entryId')::uuid for update;
  if not found or v_entry.removed_at is not null or v_entry.date not between v_source and v_source+6 then
    raise exception 'Meal week changed' using errcode='40001';
  end if;
  if v_entry.date=(p_input->>'date')::date and v_entry.slot=p_input->>'slot' then
    raise exception 'Meal already occupies that slot' using errcode='22023';
  end if;
  update public.meal_plan_entries set date=(p_input->>'date')::date,slot=p_input->>'slot' where id=v_entry.id;
  select revision into v_source_revision from public.nest_meal_week_revisions where household_id=p_household and week_start=v_source;
  select revision into v_target_revision from public.nest_meal_week_revisions where household_id=p_household and week_start=v_target;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'entryId',v_entry.id,'sourceWeekStart',v_source,'targetWeekStart',v_target,
    'sourceRevision',v_source_revision::text,'targetRevision',v_target_revision::text,'date',p_input->>'date','slot',p_input->>'slot');
  insert into public.nest_meal_move_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when check_violation or unique_violation or lock_not_available or deadlock_detected then
  raise exception 'Meal week changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_move_meal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_move_meal(uuid,uuid,jsonb) to authenticated;
create function public.nest_move_meal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_move_meal($1,$2,$3); $$;
revoke all on function public.nest_move_meal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_move_meal(uuid,uuid,jsonb) to authenticated;
