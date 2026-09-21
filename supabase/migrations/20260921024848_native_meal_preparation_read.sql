-- GATED candidate. Stable invoker reads share one snapshot and retain existing RLS.
create function private.nest_meal_preparation(p_household uuid,p_week text,p_revision text,p_entry uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_week jsonb; v_entry jsonb; v_preparation jsonb;
begin
  v_week:=private.nest_meal_week_snapshot(p_household,p_week);
  if p_entry is null or p_revision is null or p_revision !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'Invalid preparation request' using errcode='22023';
  end if;
  if p_revision::bigint<>(v_week->>'revision')::bigint then
    raise exception 'Meal week changed' using errcode='40001';
  end if;
  select jsonb_build_object('entryId',id,'date',date,'title',title_snapshot) into v_entry
    from public.meal_plan_entries where household_id=p_household and id=p_entry
      and date between p_week::date and p_week::date+6 and removed_at is null;
  if v_entry is not null then
    select jsonb_build_object('routineId',r.id,'occurrenceId',o.id,
      'routineVersion',to_char(timezone('UTC',r.updated_at),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'title',r.title,'instructions',r.instructions,'dueOn',o.due_date::text,
      'assignment',case r.assignment_policy when 'shared' then jsonb_build_object('policy','shared')
        when 'assigned' then jsonb_build_object('policy','assigned','memberId',r.assigned_member_id)
        else jsonb_build_object('policy','alternating','anchorMemberId',r.rotation_anchor_member_id) end,
      'plannedAssigneeId',o.planned_assignee_id,'status',o.status,
      'state',case when r.archived_at is not null then 'archived' when r.paused_at is not null then 'paused' else 'active' end)
      into strict v_preparation from public.routine_occurrences o join public.routines r
        on r.id=o.routine_id and r.household_id=o.household_id
      where o.household_id=p_household and o.meal_plan_entry_id=p_entry;
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,'weekStart',p_week,
    'revision',p_revision,'entryId',p_entry,'entry',v_entry,'preparation',v_preparation);
exception when no_data_found then
  return jsonb_build_object('version',1,'householdId',p_household,'weekStart',p_week,
    'revision',p_revision,'entryId',p_entry,'entry',v_entry,'preparation',null);
when numeric_value_out_of_range then raise exception 'Invalid preparation request' using errcode='22023';
end;
$$;
revoke all on function private.nest_meal_preparation(uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_meal_preparation(uuid,text,text,uuid) to authenticated;
create function public.nest_meal_preparation(p_household uuid,p_week text,p_revision text,p_entry uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_meal_preparation($1,$2,$3,$4);
$$;
revoke all on function public.nest_meal_preparation(uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_meal_preparation(uuid,text,text,uuid) to authenticated;
