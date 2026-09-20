-- GATED additive candidate. STABLE reads share the calling statement's MVCC snapshot.
-- Do not compose this from separate HTTP reads or VOLATILE read helpers.
create function private.nest_chore_snapshot(p_household uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_chores jsonb; v_members jsonb; v_transfers jsonb;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(row.value order by row.user_id),'[]'::jsonb) into v_members
  from (
    select m.user_id,jsonb_build_object('actorId',m.user_id,'displayName',m.display_name) as value
    from public.household_members m where m.household_id=p_household order by m.user_id limit 3
  ) row;
  if jsonb_array_length(v_members) not between 1 and 2 then
    raise exception 'Invalid household roster' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(row.value order by row.due_date,row.id),'[]'::jsonb) into v_chores
  from (
    select o.id,o.due_date,jsonb_build_object('occurrenceId',o.id,'title',r.title,
      'dueDate',o.due_date,'assigneeId',coalesce(o.nest_accepted_assignee_id,o.planned_assignee_id)) as value
    from public.routine_occurrences o
    join public.routines r on r.id=o.routine_id and r.household_id=o.household_id
    where o.household_id=p_household and o.status='open' and o.role='current'
      and r.archived_at is null and r.paused_at is null
    order by o.due_date,o.id limit 201
  ) row;
  select coalesce(jsonb_agg(row.value order by row.created_at,row.id),'[]'::jsonb) into v_transfers
  from (
    select t.id,t.created_at,jsonb_build_object('requestId',t.id,'occurrenceId',t.occurrence_id,
      'dueDate',t.expected_due_date,'fromMemberId',t.from_member_id,'toMemberId',t.to_member_id,
      'title',r.title) as value
    from public.nest_chore_transfers t
    join public.routine_occurrences o on o.id=t.occurrence_id and o.household_id=t.household_id
    join public.routines r on r.id=o.routine_id and r.household_id=o.household_id
    where t.household_id=p_household and t.state='pending' and o.role='current' and o.status='open'
      and r.paused_at is null and r.archived_at is null
      and t.expected_assignment_revision=o.nest_assignment_revision and t.expected_due_date=o.due_date
      and t.from_member_id=coalesce(o.nest_accepted_assignee_id,o.planned_assignee_id)
      and exists(select 1 from public.household_members m where m.household_id=p_household and m.user_id=t.to_member_id)
    order by t.created_at,t.id limit 201
  ) row;
  if jsonb_array_length(v_chores)>200 or jsonb_array_length(v_transfers)>200 then
    raise exception 'Too many chores' using errcode='22023';
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,
    'chores',v_chores,'members',v_members,'transfers',v_transfers);
end;
$$;
revoke all on function private.nest_chore_snapshot(uuid) from public,anon,authenticated;
grant execute on function private.nest_chore_snapshot(uuid) to authenticated;
create function public.nest_chore_snapshot(p_household uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_chore_snapshot($1);
$$;
revoke all on function public.nest_chore_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.nest_chore_snapshot(uuid) to authenticated;
