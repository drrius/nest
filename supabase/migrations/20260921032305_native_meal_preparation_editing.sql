-- GATED additive candidate. Corrections retain the linked occurrence and finished history.
create table public.nest_meal_preparation_edit_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(), primary key(actor_id,household_id,operation_id)
);
alter table public.nest_meal_preparation_edit_receipts enable row level security;
revoke all on public.nest_meal_preparation_edit_receipts from public,anon,authenticated,service_role;
grant select on public.nest_meal_preparation_edit_receipts to authenticated;
create policy own_meal_preparation_edit_receipts on public.nest_meal_preparation_edit_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_meal_preparation_edit_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>32768
    or not(p_input ?& array['routineId','expectedRoutineVersion','patch'])
    or jsonb_typeof(p_input->'routineId') is distinct from 'string'
    or p_input->>'routineId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or length(p_input->>'routineId')<>36
    or jsonb_typeof(p_input->'expectedRoutineVersion') is distinct from 'string' then
    raise exception 'Invalid preparation edit' using errcode='22023';
  end if;
  perform private.nest_meal_removal_input(p_input-array['routineId','expectedRoutineVersion','patch']);
  perform private.nest_routine_edit_version(p_input->>'expectedRoutineVersion');
end;
$$;
revoke all on function private.nest_meal_preparation_edit_input(jsonb) from public,anon,authenticated,service_role;

create function private.nest_meal_preparation_edit_patch(p_patch jsonb,p_household uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_patch jsonb; v_native jsonb; v_text text;
begin
  if p_patch is null or jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}'::jsonb
    or p_patch-array['title','instructions','dueOn','assignment']<>'{}'::jsonb then
    raise exception 'Invalid preparation patch' using errcode='22023';
  end if;
  v_patch:=p_patch-array['instructions','dueOn'];
  if p_patch ? 'dueOn' then
    v_patch:=v_patch||jsonb_build_object('schedule',jsonb_build_object('kind','one_off','date',p_patch->'dueOn'));
  end if;
  v_native:=case when v_patch='{}'::jsonb then '{}'::jsonb else private.nest_routine_edit_patch(v_patch,p_household) end;
  if p_patch ? 'dueOn' then
    v_native:=v_native||jsonb_build_object('active_from',p_patch->'dueOn','active_until',p_patch->'dueOn');
  end if;
  if p_patch ? 'instructions' then
    v_text:=p_patch->>'instructions';
    if jsonb_typeof(p_patch->'instructions') not in ('string','null')
      or length(v_text)+(select count(*) from regexp_split_to_table(v_text,'') c where ascii(c)>65535)>4000 then
      raise exception 'Invalid preparation instructions' using errcode='22023';
    end if;
    v_native:=v_native||jsonb_build_object('instructions',p_patch->'instructions');
  end if;
  return v_native;
end;
$$;
revoke all on function private.nest_meal_preparation_edit_patch(jsonb,uuid) from public,anon,authenticated,service_role;

create function private.nest_edit_meal_preparation(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_meal_preparation_edit_receipts;
  v_patch jsonb; v_week date; v_revision bigint; v_entry public.meal_plan_entries;
  v_occurrence public.routine_occurrences; v_version timestamptz; v_result jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  perform private.nest_meal_preparation_edit_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:prep-edit:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(p_input::text,'UTF8'));
  select * into v_prior from public.nest_meal_preparation_edit_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Preparation edit operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Preparation requires a current snapshot' using errcode='40001';
  end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  v_patch:=private.nest_meal_preparation_edit_patch(p_input->'patch',p_household);
  v_week:=(p_input->>'weekStart')::date;
  insert into public.nest_meal_week_revisions(household_id,week_start,revision)
    values(p_household,v_week,0) on conflict(household_id,week_start) do nothing;
  select revision into v_revision from public.nest_meal_week_revisions
    where household_id=p_household and week_start=v_week for update;
  if v_revision<>(p_input->>'expectedRevision')::bigint then raise exception 'Meal week changed' using errcode='40001'; end if;
  select * into v_entry from public.meal_plan_entries
    where household_id=p_household and id=(p_input->>'entryId')::uuid for update nowait;
  if not found or v_entry.removed_at is not null or v_entry.date not between v_week and v_week+6 then
    raise exception 'Meal changed' using errcode='40001';
  end if;
  select * into v_occurrence from public.routine_occurrences
    where household_id=p_household and routine_id=(p_input->>'routineId')::uuid
      and meal_plan_entry_id=v_entry.id for update nowait;
  if not found then raise exception 'Preparation changed' using errcode='40001'; end if;
  perform public.edit_routine_definition(v_occurrence.routine_id,
    private.nest_routine_edit_version(p_input->>'expectedRoutineVersion'),'nest:'||gen_random_uuid()::text,v_patch);
  select updated_at into v_version from public.routines where id=v_occurrence.routine_id and household_id=p_household;
  select * into strict v_occurrence from public.routine_occurrences where id=v_occurrence.id and meal_plan_entry_id=v_entry.id;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'entryId',v_entry.id,'weekStart',v_week::text,'revision',v_revision::text,
    'routineId',v_occurrence.routine_id,'occurrenceId',v_occurrence.id,'dueOn',v_occurrence.due_date::text,
    'previousRoutineVersion',p_input->>'expectedRoutineVersion',
    'routineVersion',to_char(timezone('UTC',v_version),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  insert into public.nest_meal_preparation_edit_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when check_violation or unique_violation or lock_not_available or deadlock_detected or object_not_in_prerequisite_state then
  raise exception 'Meal preparation changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_edit_meal_preparation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_edit_meal_preparation(uuid,uuid,jsonb) to authenticated;
create function public.nest_edit_meal_preparation(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_edit_meal_preparation($1,$2,$3);
$$;
revoke all on function public.nest_edit_meal_preparation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_edit_meal_preparation(uuid,uuid,jsonb) to authenticated;
