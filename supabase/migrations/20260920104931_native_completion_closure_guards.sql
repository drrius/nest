-- GATED additive candidate: recheck active routine under the actual closure locks.
create or replace function private.nest_complete_chore(
  p_occurrence_id uuid, p_operation_id uuid,
  p_expected_due_date date, p_completed_on date
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  occurrence public.routine_occurrences%rowtype;
  prior public.nest_chore_receipts%rowtype;
  payload jsonb := jsonb_build_object('occurrenceId', p_occurrence_id,
    'expectedDueDate', p_expected_due_date, 'completedOn', p_completed_on);
  outcome jsonb;
  completer uuid;
  completion_date date;
begin
  if actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_occurrence_id is null or p_operation_id is null or p_expected_due_date is null
    or p_completed_on is null or not isfinite(p_completed_on) or not isfinite(p_expected_due_date)
    or extract(year from p_completed_on) not between 1 and 9999
    or extract(year from p_expected_due_date) not between 1 and 9999
    or p_completed_on > private.household_today() then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  select * into occurrence from public.routine_occurrences where id = p_occurrence_id;
  if not found then
    raise exception 'not_found' using errcode = '42501';
  end if;
  perform 1 from public.household_members
    where household_id = occurrence.household_id and user_id = actor for key share;
  if not found then raise exception 'not_found' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'nest:' || occurrence.household_id::text || ':' || actor::text || ':' || p_operation_id::text, 0));
  select * into prior from public.nest_chore_receipts
    where household_id = occurrence.household_id and actor_id = actor and operation_id = p_operation_id;
  if found then
    if prior.request <> payload then raise exception 'operation_conflict' using errcode = '22023'; end if;
    return prior.result;
  end if;
  select * into occurrence from public.routine_occurrences where id = p_occurrence_id for update;
  if not found or occurrence.due_date <> p_expected_due_date then
    raise exception 'occurrence_conflict' using errcode = '40001';
  end if;
  if occurrence.status = 'open' then
    if occurrence.role <> 'current' then
      raise exception 'occurrence_conflict' using errcode = '40001';
    end if;
    -- Match closure order, but fail fast if a legacy routine-first edit holds its lock.
    perform 1 from public.routines where id=occurrence.routine_id
      and household_id=occurrence.household_id and archived_at is null and paused_at is null
      for update nowait;
    if not found then raise exception 'occurrence_conflict' using errcode='40001'; end if;
    perform public.complete_occurrence(p_occurrence_id,
      'nest:' || extensions.gen_random_uuid()::text, p_completed_on, null, null);
    if exists(select 1 from public.routine_occurrences where routine_id=occurrence.routine_id and status='open'
      and (extract(year from due_date) not between 1 and 9999
        or extract(year from original_due_date) not between 1 and 9999)) then
      raise exception 'unsupported_occurrence_date' using errcode='22023';
    end if;
  elsif occurrence.status <> 'completed' then
    raise exception 'occurrence_conflict' using errcode = '40001';
  end if;
  select completed_by_member_id, completed_on into completer, completion_date
    from public.routine_completions where occurrence_id = p_occurrence_id;
  if not found then raise exception 'completion_missing' using errcode = '55000'; end if;
  outcome := jsonb_build_object('version', 1, 'operationId', p_operation_id,
    'occurrenceId', p_occurrence_id, 'completedBy', completer, 'completedOn', completion_date,
    'outcome', case when occurrence.status = 'completed' then 'already_completed' else 'completed' end);
  insert into public.nest_chore_receipts(household_id, actor_id, operation_id, request, result)
    values (occurrence.household_id, actor, p_operation_id, payload, outcome);
  return outcome;
exception
  when lock_not_available then
    raise exception 'occurrence_conflict' using errcode='40001';
  when datetime_field_overflow or numeric_value_out_of_range then
  raise exception 'unsupported_occurrence_date' using errcode='22023';
end;
$$;
