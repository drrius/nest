-- GATED candidate: versioned native lifecycle calls reuse audited legacy primitives.
create table public.nest_routine_state_receipts (
  actor_id uuid not null references auth.users(id),
  household_id uuid not null references public.households(id),
  operation_id uuid not null,
  request_hash bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_routine_state_receipts enable row level security;
revoke all on public.nest_routine_state_receipts from public,anon,authenticated;
grant select on public.nest_routine_state_receipts to authenticated;
create policy own_routine_state_receipts on public.nest_routine_state_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_set_routine_state(p_household uuid,p_operation uuid,p_routine uuid,p_expected text,p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_routine_state_receipts;
  v_expected timestamptz; v_routine public.routines; v_result jsonb; v_version timestamptz;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_routine is null or p_action is null or p_action not in ('pause','resume','archive') then
    raise exception 'Invalid routine state command' using errcode='22023';
  end if;
  v_expected:=private.nest_routine_edit_version(p_expected);
  perform pg_advisory_xact_lock(hashtextextended('nest:routine-state:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('routine',p_routine,'version',p_expected,'action',p_action)::text,'UTF8'));
  select * into v_prior from public.nest_routine_state_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Routine operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  if not exists(select 1 from public.routines where id=p_routine and household_id=p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  -- Match edit/closure order before invoking legacy primitives that lock routine first.
  perform 1 from public.routine_occurrences where routine_id=p_routine and status='open' and role='current' for update;
  select * into v_routine from public.routines where id=p_routine and household_id=p_household for update nowait;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.routine_occurrences where routine_id=p_routine and status='open' for update nowait;
  if v_routine.updated_at<>v_expected then raise exception 'Routine changed' using errcode='40001'; end if;
  case p_action
    when 'pause' then perform public.pause_routine(p_routine);
    when 'resume' then perform public.unpause_routine(p_routine);
    when 'archive' then perform public.archive_routine(p_routine);
  end case;
  if exists(select 1 from public.routine_occurrences where routine_id=p_routine and status='open'
    and (extract(year from due_date) not between 1 and 9999 or extract(year from original_due_date) not between 1 and 9999)) then
    raise exception 'Routine dates exceed supported range' using errcode='22023';
  end if;
  select updated_at into v_version from public.routines where id=p_routine;
  v_result:=jsonb_build_object('actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'routineId',p_routine,'action',p_action,'version',to_char(timezone('UTC',v_version),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  insert into public.nest_routine_state_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when datetime_field_overflow or numeric_value_out_of_range then
  raise exception 'Routine dates exceed supported range' using errcode='22023';
end;
$$;
revoke all on function private.nest_set_routine_state(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.nest_set_routine_state(uuid,uuid,uuid,text,text) to authenticated;
create function public.nest_set_routine_state(p_household uuid,p_operation uuid,p_routine uuid,p_expected text,p_action text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_set_routine_state($1,$2,$3,$4,$5);
$$;
revoke all on function public.nest_set_routine_state(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.nest_set_routine_state(uuid,uuid,uuid,text,text) to authenticated;
