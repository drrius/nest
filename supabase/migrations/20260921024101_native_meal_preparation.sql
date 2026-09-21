-- GATED additive candidate. Linked household work only; no production application.
create table public.nest_meal_preparation_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_meal_preparation_receipts enable row level security;
revoke all on public.nest_meal_preparation_receipts from public,anon,authenticated,service_role;
grant select on public.nest_meal_preparation_receipts to authenticated;
create policy own_meal_preparation_receipts on public.nest_meal_preparation_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_meal_preparation_input(p_input jsonb,p_household uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_prep jsonb:=p_input->'preparation'; v_text text;
  v_keys text[]:=array['title','instructions','dueOn','assignment'];
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>32768 then
    raise exception 'Invalid meal preparation' using errcode='22023';
  end if;
  perform private.nest_meal_removal_input(p_input-'preparation');
  if jsonb_typeof(v_prep) is distinct from 'object' or not(v_prep ?& v_keys)
    or v_prep-v_keys<>'{}'::jsonb or jsonb_typeof(v_prep->'instructions') not in ('null','string') then
    raise exception 'Invalid preparation details' using errcode='22023';
  end if;
  v_text:=v_prep->>'instructions';
  if length(v_text)+(select count(*) from regexp_split_to_table(v_text,'') c where ascii(c)>65535)>4000 then
    raise exception 'Invalid preparation instructions' using errcode='22023';
  end if;
  return private.nest_routine_definition(jsonb_build_object('title',v_prep->'title',
    'assignment',v_prep->'assignment','schedule',jsonb_build_object('kind','one_off','date',v_prep->'dueOn')),p_household);
end;
$$;
revoke all on function private.nest_meal_preparation_input(jsonb,uuid) from public,anon,authenticated,service_role;

-- Caller owns the meal week and entry locks and validated the complete input.
create function private.nest_insert_meal_preparation(p_household uuid,p_entry uuid,p_definition jsonb,p_instructions text)
returns jsonb language plpgsql set search_path='' as $$
declare v_routine public.routines; v_occurrence uuid; v_date date:=(p_definition->'schedule'->>'date')::date;
begin
  v_routine:=private.nest_insert_routine(p_household,p_definition);
  update public.routines set instructions=p_instructions,priority='meal_deadline',
    active_from=v_date,active_until=v_date where id=v_routine.id returning * into v_routine;
  update public.routine_occurrences set meal_plan_entry_id=p_entry
    where household_id=p_household and routine_id=v_routine.id and role='current' returning id into v_occurrence;
  if v_occurrence is null then raise exception 'Preparation occurrence missing' using errcode='40001'; end if;
  return jsonb_build_object('routineId',v_routine.id,'occurrenceId',v_occurrence,'dueOn',v_date::text,
    'routineVersion',to_char(timezone('UTC',v_routine.updated_at),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
end;
$$;
revoke all on function private.nest_insert_meal_preparation(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;

create function private.nest_create_meal_preparation(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_meal_preparation_receipts;
  v_definition jsonb; v_week date; v_revision bigint; v_entry public.meal_plan_entries;
  v_result jsonb; v_members integer;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_input is null or octet_length(p_input::text)>32768 then
    raise exception 'Invalid preparation command' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:meal-preparation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(p_input::text,'UTF8'));
  select * into v_prior from public.nest_meal_preparation_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Preparation operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Preparation requires a current snapshot' using errcode='40001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:routine-create:'||p_household::text,0));
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members = row_count;
  if v_members<>2 then raise exception 'Preparation requires two household members' using errcode='40001'; end if;
  v_definition:=private.nest_meal_preparation_input(p_input,p_household);
  v_week:=(p_input->>'weekStart')::date;
  insert into public.nest_meal_week_revisions(household_id,week_start,revision)
    values(p_household,v_week,0) on conflict(household_id,week_start) do nothing;
  select revision into v_revision from public.nest_meal_week_revisions
    where household_id=p_household and week_start=v_week for update;
  if v_revision<>(p_input->>'expectedRevision')::bigint then
    raise exception 'Meal week changed' using errcode='40001';
  end if;
  select * into v_entry from public.meal_plan_entries
    where household_id=p_household and id=(p_input->>'entryId')::uuid for update nowait;
  if not found or v_entry.removed_at is not null or v_entry.date not between v_week and v_week+6 then
    raise exception 'Meal changed' using errcode='40001';
  end if;
  if exists(select 1 from public.routine_occurrences where meal_plan_entry_id=v_entry.id) then
    raise exception 'Meal already has preparation' using errcode='40001';
  end if;
  v_result:=private.nest_insert_meal_preparation(p_household,v_entry.id,v_definition,p_input->'preparation'->>'instructions')
    ||jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
      'entryId',v_entry.id,'weekStart',v_week::text,'revision',v_revision::text);
  insert into public.nest_meal_preparation_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when check_violation or unique_violation or lock_not_available or deadlock_detected then
  raise exception 'Meal preparation changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_create_meal_preparation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_create_meal_preparation(uuid,uuid,jsonb) to authenticated;
create function public.nest_create_meal_preparation(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_create_meal_preparation($1,$2,$3);
$$;
revoke all on function public.nest_create_meal_preparation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_create_meal_preparation(uuid,uuid,jsonb) to authenticated;
