-- GATED candidate: online skip/reschedule with native actor-bound replay.
create table public.nest_chore_change_receipts (
  actor_id uuid not null references auth.users(id),
  household_id uuid not null references public.households(id),
  operation_id uuid not null,
  request_hash bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_chore_change_receipts enable row level security;
revoke all on public.nest_chore_change_receipts from public,anon,authenticated;
grant select on public.nest_chore_change_receipts to authenticated;
create policy own_chore_change_receipts on public.nest_chore_change_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_change_chore(p_household uuid,p_operation uuid,p_occurrence uuid,
  p_expected_due_date date,p_action text,p_new_due_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_chore_change_receipts;
  v_occurrence public.routine_occurrences; v_result jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_occurrence is null or p_expected_due_date is null
    or not isfinite(p_expected_due_date) or extract(year from p_expected_due_date) not between 1 and 9999
    or p_action is null or p_action not in ('skip','reschedule')
    or (p_action='skip' and p_new_due_date is not null)
    or (p_action='reschedule' and (p_new_due_date is null or not isfinite(p_new_due_date)
      or extract(year from p_new_due_date) not between 1 and 9999 or p_new_due_date=p_expected_due_date)) then
    raise exception 'Invalid chore change' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:chore-change:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('occurrence',p_occurrence,'expected',p_expected_due_date,
    'action',p_action,'date',p_new_due_date)::text,'UTF8'));
  select * into v_prior from public.nest_chore_change_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Chore operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  select * into v_occurrence from public.routine_occurrences
    where id=p_occurrence and household_id=p_household for update;
  if not found then raise exception 'Chore unavailable' using errcode='42501'; end if;
  if v_occurrence.status<>'open' or v_occurrence.role is distinct from 'current'
    or v_occurrence.due_date<>p_expected_due_date then
    raise exception 'Chore changed' using errcode='40001';
  end if;
  perform 1 from public.routines where id=v_occurrence.routine_id and household_id=p_household
    and archived_at is null and paused_at is null for update nowait;
  if not found then raise exception 'Chore changed' using errcode='40001'; end if;
  if p_action='skip' then
    perform public.skip_occurrence(p_occurrence,'nest:'||extensions.gen_random_uuid()::text);
  else
    perform public.reschedule_occurrence(p_occurrence,p_new_due_date,'nest:'||extensions.gen_random_uuid()::text);
  end if;
  if exists(select 1 from public.routine_occurrences where routine_id=v_occurrence.routine_id and status='open'
    and (extract(year from due_date) not between 1 and 9999 or extract(year from original_due_date) not between 1 and 9999)) then
    raise exception 'Unsupported chore date' using errcode='22023';
  end if;
  v_result:=jsonb_build_object('actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'occurrenceId',p_occurrence,'action',p_action,'previousDueDate',p_expected_due_date,
    'dueDate',coalesce(p_new_due_date,p_expected_due_date),'status',case when p_action='skip' then 'skipped' else 'open' end);
  insert into public.nest_chore_change_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception
  when lock_not_available then
    raise exception 'Chore changed' using errcode='40001';
  when datetime_field_overflow or numeric_value_out_of_range then
  raise exception 'Unsupported chore date' using errcode='22023';
end;
$$;
revoke all on function private.nest_change_chore(uuid,uuid,uuid,date,text,date) from public,anon,authenticated;
grant execute on function private.nest_change_chore(uuid,uuid,uuid,date,text,date) to authenticated;
create function public.nest_change_chore(p_household uuid,p_operation uuid,p_occurrence uuid,
  p_expected_due_date date,p_action text,p_new_due_date date default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_change_chore($1,$2,$3,$4,$5,$6);
$$;
revoke all on function public.nest_change_chore(uuid,uuid,uuid,date,text,date) from public,anon,authenticated;
grant execute on function public.nest_change_chore(uuid,uuid,uuid,date,text,date) to authenticated;
