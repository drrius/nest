-- Audited test-only source excerpts from household-os 4a528c9.
create or replace function private.first_rebuild_due_date(
  p_schedule_rule jsonb,
  p_previous_rule jsonb,
  p_window_anchor date,
  p_from_inclusive date
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_schedule_rule ->> 'kind' <> 'biweekly'
    or p_window_anchor is null
    or p_previous_rule is null
    or p_schedule_rule <> p_previous_rule
  then
    return private.first_routine_due_date(p_schedule_rule, p_from_inclusive);
  end if;

  if p_from_inclusive <= p_window_anchor then
    return p_window_anchor;
  end if;

  return p_window_anchor
    + ((((p_from_inclusive - p_window_anchor) + 13) / 14) * 14);
end;
$$;
create or replace function private.ensure_routine_window(
  p_routine_id uuid,
  p_first_due_date date default null,
  p_previous_planned_assignee_id uuid default null,
  p_first_original_due_date date default null,
  p_first_rescheduled_at timestamptz default null,
  p_first_planned_assignee_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  routine public.routines%rowtype;
  current_occurrence public.routine_occurrences%rowtype;
  latest_occurrence public.routine_occurrences%rowtype;
  first_due_date date := p_first_due_date;
  -- The caller-supplied anchor and reschedule timestamp only make sense for
  -- the caller-supplied due date, never for one derived from history below.
  first_original_due_date date := case
    when p_first_due_date is not null then p_first_original_due_date
  end;
  first_rescheduled_at timestamptz := case
    when p_first_due_date is not null then p_first_rescheduled_at
  end;
  first_planned_assignee_id uuid := case
    when p_first_due_date is not null then p_first_planned_assignee_id
  end;
  second_due_date date;
  previous_assignee_id uuid := p_previous_planned_assignee_id;
  current_occurrence_id uuid;
  latest_completed_on date;
begin
  select stored_routine.*
  into routine
  from public.routines as stored_routine
  where stored_routine.id = p_routine_id
  for update;

  if not found or routine.archived_at is not null or routine.paused_at is not null then
    return;
  end if;

  select occurrence.*
  into current_occurrence
  from public.routine_occurrences as occurrence
  where occurrence.routine_id = routine.id
    and occurrence.status = 'open'
    and occurrence.role = 'current'
  for update;

  if found then
    perform 1
    from public.routine_occurrences as occurrence
    where occurrence.routine_id = routine.id
      and occurrence.status = 'open'
      and occurrence.role = 'preview'
    for update;
    if found then
      return;
    end if;

    -- Previews follow the recurrence anchor, not a reschedule: per ADR 0014 a
    -- reschedule moves only its own occurrence, and the reschedule command
    -- leaves the preview on the original cadence.
    second_due_date := private.next_routine_due_date(
      routine.schedule_rule,
      current_occurrence.original_due_date,
      null,
      current_occurrence.original_due_date
    );
    -- An anchor-derived preview can land before a later active_from (a
    -- rescheduled current may sit past it while the anchor does not); advance
    -- it to the first phase-correct date inside the window.
    if second_due_date is not null
      and routine.active_from is not null
      and second_due_date < routine.active_from
    then
      second_due_date := private.first_rebuild_due_date(
        routine.schedule_rule,
        routine.schedule_rule,
        current_occurrence.original_due_date,
        routine.active_from
      );
    end if;
    if second_due_date is not null
      and (routine.active_until is null or second_due_date <= routine.active_until)
    then
      perform private.insert_open_routine_occurrence(
        routine,
        'preview',
        second_due_date,
        current_occurrence.planned_assignee_id
      );
    end if;
    return;
  end if;

  if first_due_date is null then
    select occurrence.*
    into latest_occurrence
    from public.routine_occurrences as occurrence
    where occurrence.routine_id = routine.id
      and occurrence.status in ('completed', 'skipped')
    order by occurrence.closed_at desc, occurrence.created_at desc
    limit 1;

    if found then
      select completion.completed_on
      into latest_completed_on
      from public.routine_completions as completion
      where completion.occurrence_id = latest_occurrence.id;

      previous_assignee_id := latest_occurrence.planned_assignee_id;
      first_due_date := private.next_routine_due_date(
        routine.schedule_rule,
        latest_occurrence.due_date,
        latest_completed_on,
        latest_occurrence.original_due_date
      );
    else
      first_due_date := private.first_routine_due_date(
        routine.schedule_rule,
        greatest(private.household_today(), coalesce(routine.active_from, private.household_today()))
      );
    end if;
  end if;

  if first_due_date is null
    or (routine.active_until is not null and first_due_date > routine.active_until)
  then
    return;
  end if;

  current_occurrence_id := private.insert_open_routine_occurrence(
    routine,
    'current',
    first_due_date,
    previous_assignee_id,
    first_original_due_date,
    first_rescheduled_at,
    first_planned_assignee_id
  );

  select occurrence.*
  into current_occurrence
  from public.routine_occurrences as occurrence
  where occurrence.id = current_occurrence_id;

  second_due_date := private.next_routine_due_date(
    routine.schedule_rule,
    current_occurrence.original_due_date,
    null,
    current_occurrence.original_due_date
  );
  if second_due_date is not null
    and routine.active_from is not null
    and second_due_date < routine.active_from
  then
    second_due_date := private.first_rebuild_due_date(
      routine.schedule_rule,
      routine.schedule_rule,
      current_occurrence.original_due_date,
      routine.active_from
    );
  end if;
  if second_due_date is not null
    and (routine.active_until is null or second_due_date <= routine.active_until)
  then
    perform private.insert_open_routine_occurrence(
      routine,
      'preview',
      second_due_date,
      current_occurrence.planned_assignee_id
    );
  end if;
end;
$$;
