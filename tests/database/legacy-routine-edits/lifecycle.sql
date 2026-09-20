-- Audited test-only excerpts from household-os 4a528c9, 20260809210000_routine_engine.sql.
create or replace function public.pause_routine(p_routine_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_member_id uuid := auth.uid();
  routine public.routines%rowtype;
begin
  select stored_routine.*
  into routine
  from public.routines as stored_routine
  where stored_routine.id = p_routine_id
  for update;
  if not found then
    raise exception 'routine % does not exist', p_routine_id using errcode = 'P0002';
  end if;
  if actor_member_id is null or not private.is_household_member(routine.household_id) then
    raise exception 'caller is not a household member' using errcode = '42501';
  end if;
  if routine.archived_at is not null then
    raise exception 'archived routines cannot be paused' using errcode = '55000';
  end if;

  if routine.paused_at is null then
    update public.routines set paused_at = now() where id = routine.id;
    update public.reminder_candidates as candidate
    set status = 'cancelled'
    from public.routine_occurrences as occurrence
    where occurrence.id = candidate.occurrence_id
      and occurrence.routine_id = routine.id
      and occurrence.status = 'open'
      and candidate.status = 'pending';
    insert into public.activity_events (
      household_id, actor_member_id, kind, entity_type, entity_id
    )
    values (
      routine.household_id, actor_member_id, 'routine_paused', 'routine', routine.id
    );
  end if;
  return jsonb_build_object('routine_id', routine.id, 'paused', true);
end;
$$;

create or replace function public.unpause_routine(p_routine_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_member_id uuid := auth.uid();
  routine public.routines%rowtype;
  occurrence_id uuid;
begin
  select stored_routine.*
  into routine
  from public.routines as stored_routine
  where stored_routine.id = p_routine_id
  for update;
  if not found then
    raise exception 'routine % does not exist', p_routine_id using errcode = 'P0002';
  end if;
  if actor_member_id is null or not private.is_household_member(routine.household_id) then
    raise exception 'caller is not a household member' using errcode = '42501';
  end if;
  if routine.archived_at is not null then
    raise exception 'archived routines cannot be unpaused' using errcode = '55000';
  end if;

  if routine.paused_at is not null then
    update public.routines set paused_at = null where id = routine.id;
    perform private.ensure_routine_window(routine.id, null, null);
    for occurrence_id in
      select occurrence.id
      from public.routine_occurrences as occurrence
      where occurrence.routine_id = routine.id
        and occurrence.status = 'open'
    loop
      perform private.create_reminder_candidates_for_occurrence(occurrence_id);
    end loop;
    insert into public.activity_events (
      household_id, actor_member_id, kind, entity_type, entity_id
    )
    values (
      routine.household_id, actor_member_id, 'routine_unpaused', 'routine', routine.id
    );
  end if;
  return jsonb_build_object('routine_id', routine.id, 'paused', false);
end;
$$;

create or replace function public.archive_routine(p_routine_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_member_id uuid := auth.uid();
  routine public.routines%rowtype;
begin
  select stored_routine.*
  into routine
  from public.routines as stored_routine
  where stored_routine.id = p_routine_id
  for update;
  if not found then
    raise exception 'routine % does not exist', p_routine_id using errcode = 'P0002';
  end if;
  if actor_member_id is null or not private.is_household_member(routine.household_id) then
    raise exception 'caller is not a household member' using errcode = '42501';
  end if;

  if routine.archived_at is null then
    update public.routines set archived_at = now() where id = routine.id;
    update public.reminder_candidates as candidate
    set status = 'cancelled'
    from public.routine_occurrences as occurrence
    where occurrence.id = candidate.occurrence_id
      and occurrence.routine_id = routine.id
      and occurrence.status = 'open'
      and candidate.status = 'pending';
    delete from public.routine_occurrences
    where routine_id = routine.id
      and status = 'open'
      and role = 'preview';
    insert into public.activity_events (
      household_id, actor_member_id, kind, entity_type, entity_id
    )
    values (
      routine.household_id, actor_member_id, 'routine_archived', 'routine', routine.id
    );
  end if;
  return jsonb_build_object('routine_id', routine.id, 'archived', true);
end;
$$;

-- Fixture permission setup mirrors the legacy migration's explicit RPC grants.
revoke all on function public.pause_routine(uuid), public.unpause_routine(uuid), public.archive_routine(uuid) from public,anon,authenticated;
grant execute on function public.pause_routine(uuid), public.unpause_routine(uuid), public.archive_routine(uuid) to authenticated;
