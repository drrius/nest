-- Additive candidate only. Production application requires explicit owner approval.
-- Requires the existing audited routines/membership schema and complete_occurrence.
create table public.nest_chore_receipts (
  household_id uuid not null,
  actor_id uuid not null,
  operation_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (household_id, actor_id, operation_id),
  foreign key (household_id, actor_id)
    references public.household_members(household_id, user_id)
);
alter table public.nest_chore_receipts enable row level security;
revoke all on public.nest_chore_receipts from public, anon, authenticated;
grant select on public.nest_chore_receipts to authenticated;
create policy own_current_household_receipts on public.nest_chore_receipts
  for select to authenticated using (
    actor_id = (select auth.uid())
    and private.is_household_member(household_id)
  );

create function private.nest_complete_chore(
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
    or p_completed_on > private.household_today() then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  select * into occurrence from public.routine_occurrences where id = p_occurrence_id;
  if not found or not private.is_household_member(occurrence.household_id) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'nest:' || occurrence.household_id::text || ':' || actor::text || ':' || p_operation_id::text, 0));
  select * into prior from public.nest_chore_receipts
    where household_id = occurrence.household_id and actor_id = actor and operation_id = p_operation_id;
  if found then
    if prior.request <> payload then raise exception 'operation_conflict' using errcode = '22023'; end if;
    return prior.result;
  end if;
  select * into occurrence from public.routine_occurrences where id = p_occurrence_id for update;
  if occurrence.status = 'open' then
    if occurrence.role <> 'current' or occurrence.due_date <> p_expected_due_date then
      raise exception 'occurrence_conflict' using errcode = '40001';
    end if;
    perform public.complete_occurrence(p_occurrence_id,
      'nest:' || actor::text || ':' || p_operation_id::text, p_completed_on, null, null);
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
end;
$$;
revoke all on function private.nest_complete_chore(uuid, uuid, date, date) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.nest_complete_chore(uuid, uuid, date, date) to authenticated;

create function public.nest_complete_chore(
  p_occurrence_id uuid, p_operation_id uuid,
  p_expected_due_date date, p_completed_on date
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.nest_complete_chore(p_occurrence_id, p_operation_id,
    p_expected_due_date, p_completed_on);
$$;
revoke all on function public.nest_complete_chore(uuid, uuid, date, date) from public, anon;
grant execute on function public.nest_complete_chore(uuid, uuid, date, date) to authenticated;
