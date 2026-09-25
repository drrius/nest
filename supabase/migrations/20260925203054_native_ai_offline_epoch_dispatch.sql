-- GATED: only the two existing online AI commands gain the epoch-bound path.
create or replace function private.nest_dispatch_ai_basic_command(p_household uuid,p_operation uuid,p_tool text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_target uuid; v_action text; v_epoch uuid;
begin
  if p_tool='saveRecurringReminder' then
    return public.nest_save_recurring_reminder(p_household,p_operation,p_input);
  end if;
  if p_tool='saveGroceryReminder' then
    return public.nest_save_grocery_reminder(p_household,p_operation,p_input);
  end if;
  if p_tool='saveMealReminder' then
    return public.nest_save_meal_reminder(p_household,p_operation,p_input);
  end if;
  if p_tool='saveChoreReminder' then
    return public.nest_save_chore_reminder(p_household,p_operation,p_input);
  end if;
  -- Online AI commands take the control lock in this transaction; no client can
  -- invoke this dispatcher or use it to relabel queued native intent.
  if p_tool in ('completeChore','checkGrocery') then
    select offline_epoch into v_epoch from private.nest_household_write_control
      where singleton for share;
    if not found then raise exception 'Household writes suspended' using errcode='PT503'; end if;
  end if;
  -- This internal dispatcher is never directly executable by a client.
  if p_tool='completeChore' then
    v_target:=(p_input->>'occurrenceId')::uuid;
    if not exists(select 1 from public.routine_occurrences where id=v_target and household_id=p_household) then
      raise exception 'Not authorized' using errcode='42501';
    end if;
    return private.nest_complete_chore_at_epoch(p_input || jsonb_build_object('operationId',p_operation),v_epoch);
  end if;
  v_target:=case when p_tool='addGrocery' then gen_random_uuid() else (p_input->>'itemId')::uuid end;
  if p_tool='checkGrocery' then
    return private.nest_check_grocery_at_epoch(p_household,p_input || jsonb_build_object('operationId',p_operation),v_epoch);
  end if;
  v_action:=case p_tool when 'addGrocery' then 'add' when 'editGrocery' then 'edit' when 'removeGrocery' then 'remove' end;
  if v_action is null then raise exception 'Unsupported AI command' using errcode='22023'; end if;
  return private.nest_edit_grocery(p_household,p_operation,v_action,v_target,
    (p_input->>'expectedVersion')::bigint,p_input->>'name',p_input->>'quantity',p_input->>'unit',
    (p_input->>'categoryId')::uuid);
end;
$$;
revoke all on function private.nest_dispatch_ai_basic_command(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

