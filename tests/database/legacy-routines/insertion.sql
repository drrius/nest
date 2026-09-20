-- Audited test-only source excerpts from household-os 4a528c9.
-- Native creation subset; not a full legacy closure/edit engine rehearsal.
create or replace function private.next_routine_assignee(
  p_household_id uuid,
  p_assignment_policy text,
  p_assigned_member_id uuid,
  p_rotation_anchor_member_id uuid,
  p_previous_planned_assignee_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  next_member_id uuid;
begin
  case p_assignment_policy
    when 'assigned' then
      return p_assigned_member_id;
    when 'shared' then
      return null;
    when 'alternating' then
      if p_previous_planned_assignee_id is null then
        return p_rotation_anchor_member_id;
      end if;
      select member.user_id
      into next_member_id
      from public.household_members as member
      where member.household_id = p_household_id
        and member.user_id <> p_previous_planned_assignee_id
      order by member.joined_at, member.user_id
      limit 1;
      if next_member_id is null then
        raise exception 'alternating assignment requires two household members';
      end if;
      return next_member_id;
    else
      raise exception 'unknown assignment policy %', p_assignment_policy;
  end case;
end;
$$;

create or replace function private.create_reminder_candidates_for_occurrence(
  p_occurrence_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.reminder_candidates (
    household_id,
    member_id,
    occurrence_id,
    remind_on,
    remind_local_time,
    status
  )
  select
    occurrence.household_id,
    preference.member_id,
    occurrence.id,
    occurrence.due_date,
    preference.due_day_local_time,
    'pending'
  from public.routine_occurrences as occurrence
  join public.routine_reminder_preferences as preference
    on preference.household_id = occurrence.household_id
    and preference.routine_id = occurrence.routine_id
    and preference.enabled
  where occurrence.id = p_occurrence_id
    and occurrence.status = 'open'
  on conflict (household_id, member_id, occurrence_id)
  do update
  set remind_on = excluded.remind_on,
      remind_local_time = excluded.remind_local_time,
      status = 'pending';
end;
$$;

create or replace function private.insert_open_routine_occurrence(
  p_routine public.routines,
  p_role text,
  p_due_date date,
  p_previous_planned_assignee_id uuid,
  p_original_due_date date default null,
  p_rescheduled_at timestamptz default null,
  p_planned_assignee_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  occurrence_id uuid;
  planned_assignee_id uuid;
begin
  if p_role not in ('current', 'preview') then
    raise exception 'unknown occurrence role %', p_role;
  end if;

  -- A non-null p_planned_assignee_id recreates a preserved occurrence with
  -- its exact assignee instead of advancing the assignment policy. Shared
  -- occurrences carry a null assignee, which the policy re-derives anyway.
  if p_planned_assignee_id is not null then
    planned_assignee_id := p_planned_assignee_id;
  else
    planned_assignee_id := private.next_routine_assignee(
      p_routine.household_id,
      p_routine.assignment_policy,
      p_routine.assigned_member_id,
      p_routine.rotation_anchor_member_id,
      p_previous_planned_assignee_id
    );
  end if;

  insert into public.routine_occurrences (
    household_id,
    routine_id,
    due_date,
    original_due_date,
    rescheduled_at,
    planned_assignee_id,
    status,
    role
  )
  values (
    p_routine.household_id,
    p_routine.id,
    p_due_date,
    coalesce(p_original_due_date, p_due_date),
    p_rescheduled_at,
    planned_assignee_id,
    'open',
    p_role
  )
  returning id into occurrence_id;

  perform private.create_reminder_candidates_for_occurrence(occurrence_id);
  return occurrence_id;
end;
$$;
