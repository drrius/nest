-- GATED private proposals only. No model approval, linkage or financial posting.
create function private.nest_canonical_manual_cycle_proposal(p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_input jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Invalid manual cycle proposal' using errcode='22023'; end if;
  v_input:=p_input||jsonb_build_object('ruleId',private.nest_expense_uuid(p_input->'ruleId',false),
    'expectedRevision',private.nest_expense_uuid(p_input->'expectedRevision',false),
    'sourceEventId',private.nest_expense_uuid(p_input->'sourceEventId',false));
  perform private.nest_manual_cycle_input(v_input);
  return v_input;
end;
$$;
revoke all on function private.nest_canonical_manual_cycle_proposal(jsonb) from public,anon,authenticated;
create function private.nest_propose_manual_cycle(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_rule public.nest_recurring_rules; v_cursor private.nest_recurring_execution;
  v_id uuid; v_due date; v_members integer; v_cycle jsonb; v_source jsonb; v_event uuid; v_approval uuid;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid cycle operation' using errcode='22023'; end if;
  p_input:=private.nest_canonical_manual_cycle_proposal(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-cycle-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Manual cycle requires two members' using errcode='42501'; end if;
  v_id:=(p_input->>'ruleId')::uuid; v_due:=(p_input->>'dueOn')::date;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-rule:'||p_household::text||':'||v_id::text,0));
  select * into v_rule from public.nest_recurring_rules where household_id=p_household and id=v_id for update;
  if not found or v_rule.revision<>(p_input->>'expectedRevision')::uuid or v_rule.status<>'active' then
    raise exception 'Recurring rule changed' using errcode='40001'; end if;
  select * into v_cursor from private.nest_recurring_execution where household_id=p_household and rule_id=v_id for update;
  if not found then raise exception 'Recurring execution unavailable' using errcode='55000'; end if;
  if v_cursor.next_due_on is distinct from v_due or v_due>(clock_timestamp() at time zone 'Europe/Zurich')::date
    or v_due<(v_rule.configuration->>'startDate')::date then
    raise exception 'Recurring cycle is not due' using errcode='40001'; end if;
  v_cycle:=private.nest_recurring_cycle(v_rule.configuration->'schedule',v_due,v_cursor.covered_through);
  if v_cycle is null or v_cycle->>'dueOn' is distinct from p_input->>'dueOn'
    or exists(select 1 from public.nest_recurring_cycles where household_id=p_household and rule_id=v_id and cycle_key=v_cycle->>'key') then
    raise exception 'Cycle already covered' using errcode='40001'; end if;
  v_event:=(p_input->>'sourceEventId')::uuid;
  perform 1 from public.financial_events where household_id=p_household and id=v_event for update;
  if not found then raise exception 'Manual expense unavailable' using errcode='42501'; end if;
  -- Existing correction/refund commands lock the source before the ledger.
  perform private.lock_household_ledger(p_household);
  v_source:=private.nest_money_detail(p_household,v_event);
  if v_source->'event'->>'kind' not in ('expense','replacement') or v_source->>'reversedById' is not null
    or (v_source->'event'->>'occurredOn')::date<(v_cycle->>'startsOn')::date
    or (v_source->'event'->>'occurredOn')::date>(v_cycle->>'through')::date
    or exists(select 1 from public.nest_recurring_cycles where event_id=v_event) then
    raise exception 'Manual expense is not eligible for this cycle' using errcode='40001'; end if;
  v_approval:=private.nest_propose_action(p_household,p_operation,'recurring.link-cycle',1,p_input);
  return private.nest_read_manual_cycle_approval(p_household,v_approval);
end;
$$;
revoke all on function private.nest_propose_manual_cycle(uuid,uuid,jsonb) from public,anon,authenticated;

alter table public.nest_ai_commands drop constraint nest_ai_commands_tool_name_check;
alter table public.nest_ai_commands add constraint nest_ai_commands_tool_name_check
  check(tool_name in ('proposeManualCycle','proposeVariableCycle','proposeRecurringResume','proposeRecurringState','proposeRecurring','proposeCorrection','proposeRefund','proposeSettlement','proposeExpense','generateMealProposal','replaceProposalMeal','chooseProposalRecipe','discardMealProposal','editMealPreparation','createMealPreparation','placeLeftovers','placeRecipe','replaceWithRecipe','editRecipe','archiveRecipe','createRecipe','replaceMeal','moveMeal','removeMeal','placeMeal','completeChore','addGrocery','editGrocery','removeGrocery','checkGrocery',
    'saveFoodPreferences','saveCookingPreferences','proposeMemory','removeMemory','saveNotificationPreferences','createRoutine','editRoutine','setRoutineState','skipChore','rescheduleChore','requestChoreTransfer','respondChoreTransfer'));

create or replace function private.nest_validate_ai_command(p_tool text,p_input jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_tool='proposeManualCycle' then
    perform private.nest_canonical_manual_cycle_proposal(p_input);
    return;
  end if;
  if p_tool='proposeVariableCycle' then
    perform private.nest_canonical_variable_cycle_proposal(p_input);
    return;
  end if;
  if p_tool='proposeRecurringResume' then
    perform private.nest_canonical_recurring_resume_proposal(p_input);
    return;
  end if;
  if p_tool='proposeRecurringState' then
    perform private.nest_canonical_recurring_state_proposal(p_input);
    return;
  end if;
  if p_tool='proposeRecurring' then
    perform private.nest_canonical_recurring_proposal(p_input,'00000000-0000-4000-8000-000000000001');
    return;
  end if;
  if p_tool='proposeCorrection' then
    perform private.nest_canonical_correction(p_input);
    return;
  end if;
  if p_tool='proposeRefund' then
    perform private.nest_canonical_refund(p_input);
    return;
  end if;
  if p_tool='proposeSettlement' then
    perform private.nest_canonical_settlement(p_input);
    return;
  end if;
  if p_tool='proposeExpense' then
    perform private.nest_canonical_expense(p_input);
    return;
  end if;
  if p_tool in ('generateMealProposal','replaceProposalMeal','chooseProposalRecipe','discardMealProposal','editMealPreparation','createMealPreparation','placeLeftovers','placeRecipe','replaceWithRecipe','editRecipe','archiveRecipe','createRecipe','replaceMeal','moveMeal','removeMeal','placeMeal') then
    perform private.nest_validate_ai_meal_command(p_tool,p_input);
    return;
  end if;
  if p_tool='requestChoreTransfer' then
    perform private.nest_validate_chore_transfer('request',p_input);
    return;
  end if;
  if p_tool='respondChoreTransfer' then
    if jsonb_typeof(p_input->'action') is distinct from 'string'
      or p_input->>'action' not in ('accept','decline') then
      raise exception 'Invalid handover response' using errcode='22023';
    end if;
    perform private.nest_validate_chore_transfer(p_input->>'action',p_input-'action');
    return;
  end if;
  if p_tool in ('skipChore','rescheduleChore') then
    perform private.nest_validate_ai_chore_change(p_tool,p_input);
    return;
  end if;
  if p_tool in ('setRoutineState','editRoutine','createRoutine') then
    perform private.nest_validate_ai_routine_command(p_tool,p_input);
    return;
  end if;
  if p_tool='saveNotificationPreferences' then
    perform private.nest_validate_ai_notification_preferences(p_input);
    return;
  end if;
  if p_tool in ('proposeMemory','removeMemory') then
    perform private.nest_validate_ai_memory(p_tool,p_input);
    return;
  end if;
  if p_tool='saveCookingPreferences' then
    perform private.nest_validate_ai_cooking_preferences(p_input);
    return;
  end if;
  if p_tool='saveFoodPreferences' then
    perform private.nest_validate_ai_food_preferences(p_input);
    return;
  end if;
  perform private.nest_validate_ai_basic_command(p_tool,p_input);
end;
$$;

create or replace function private.nest_dispatch_ai_command(p_household uuid,p_operation uuid,p_tool text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_tool='proposeManualCycle' then
    return private.nest_propose_manual_cycle(p_household,p_operation,p_input);
  end if;
  if p_tool='proposeVariableCycle' then
    return private.nest_propose_variable_cycle(p_household,p_operation,p_input);
  end if;
  if p_tool='proposeRecurringResume' then
    return private.nest_propose_recurring_resume(p_household,p_operation,p_input);
  end if;
  if p_tool='proposeRecurringState' then
    return private.nest_propose_recurring_state(p_household,p_operation,p_input);
  end if;
  if p_tool='proposeRecurring' then
    return private.nest_propose_recurring(p_household,p_operation,p_input);
  end if;
  if p_tool='proposeCorrection' then
    return private.nest_propose_correction(p_household,p_operation,p_input);
  end if;
  if p_tool='proposeRefund' then
    return private.nest_propose_refund(p_household,p_operation,p_input);
  end if;
  if p_tool='proposeSettlement' then
    return private.nest_propose_settlement(p_household,p_operation,p_input);
  end if;
  if p_tool='proposeExpense' then
    return private.nest_propose_expense(p_household,p_operation,p_input);
  end if;
  if p_tool in ('generateMealProposal','replaceProposalMeal','chooseProposalRecipe','discardMealProposal','editMealPreparation','createMealPreparation','placeLeftovers','placeRecipe','replaceWithRecipe','editRecipe','archiveRecipe','createRecipe','replaceMeal','moveMeal','removeMeal','placeMeal') then
    return private.nest_dispatch_ai_meal(p_household,p_operation,p_tool,p_input);
  end if;
  if p_tool='requestChoreTransfer' then
    return private.nest_chore_transfer(p_household,p_operation,'request',p_input);
  end if;
  if p_tool='respondChoreTransfer' then
    return private.nest_chore_transfer(p_household,p_operation,p_input->>'action',p_input-'action');
  end if;
  if p_tool in ('skipChore','rescheduleChore') then
    return private.nest_change_chore(p_household,p_operation,(p_input->>'occurrenceId')::uuid,
      (p_input->>'expectedDueDate')::date,
      case when p_tool='skipChore' then 'skip' else 'reschedule' end,
      (p_input->>'newDueDate')::date);
  end if;
  if p_tool='setRoutineState' then
    begin
      return private.nest_set_routine_state(p_household,p_operation,(p_input->>'routineId')::uuid,
        p_input->>'expectedVersion',p_input->>'action');
    exception when lock_not_available or object_not_in_prerequisite_state then
      raise exception 'Routine changed; read its current state' using errcode='40001';
    end;
  end if;
  if p_tool='editRoutine' then
    begin
      return private.nest_edit_routine(p_household,p_operation,(p_input->>'routineId')::uuid,
        p_input->>'expectedVersion',p_input->'patch');
    exception when lock_not_available or object_not_in_prerequisite_state then
      -- Persist a terminal conflict in the journal, just like a stale baseline.
      raise exception 'Routine changed; read its current state' using errcode='40001';
    end;
  end if;
  if p_tool='createRoutine' then
    return private.nest_create_routine(p_household,p_operation,p_input->'definition');
  end if;
  if p_tool='saveNotificationPreferences' then
    return private.nest_save_notification_preferences(p_household,p_operation,(p_input->>'expectedRevision')::bigint,
      (p_input->'preferences'->>'dailySummaryEnabled')::boolean, p_input->'preferences'->>'dailySummaryTime',
      (p_input->'preferences'->>'itemRemindersEnabled')::boolean);
  end if;
  if p_tool='proposeMemory' then
    return private.nest_propose_memory(p_household,p_operation,p_input);
  end if;
  if p_tool='removeMemory' then
    return private.nest_remove_memory(p_household,p_operation,(p_input->>'memoryId')::uuid,(p_input->>'expectedRevision')::bigint);
  end if;
  if p_tool='saveCookingPreferences' then
    return private.nest_save_cooking_preferences(p_household,p_operation,(p_input->>'expectedRevision')::bigint,
      p_input->'preferences'->>'cookingNotes',
      array(select jsonb_array_elements_text(p_input->'preferences'->'mealSlots')));
  end if;
  if p_tool='saveFoodPreferences' then
    return private.nest_save_food_profile(p_household,p_operation,(p_input->>'expectedRevision')::bigint,
      array(select jsonb_array_elements_text(p_input->'preferences'->'restrictions')),
      array(select jsonb_array_elements_text(p_input->'preferences'->'dislikes')),
      (p_input->'preferences'->>'calorieGoal')::integer,(p_input->'preferences'->>'portions')::numeric);
  end if;
  return private.nest_dispatch_ai_basic_command(p_household,p_operation,p_tool,p_input);
end;
$$;

create or replace function private.nest_ai_command_response(p_turn public.nest_ai_turns,p_response jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_journal jsonb; v_parts jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('type','tool-'||tool_name,'toolCallId',tool_call_id,
    'state','output-available','input',input,'output',result) order by sequence),'[]'::jsonb)
    into v_journal from public.nest_ai_commands
    where conversation_id=p_turn.conversation_id and turn_id=p_turn.operation_id;
  if p_response is null and v_journal='[]'::jsonb then return null; end if;
  if p_response is null then
    p_response:=jsonb_build_object('id',p_turn.assistant_id,'role','assistant','parts','[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(part order by position),'[]'::jsonb) into v_parts
    from jsonb_array_elements(p_response->'parts') with ordinality as parts(part,position)
    where coalesce(part->>'type','') not in
      ('tool-proposeManualCycle','tool-proposeVariableCycle','tool-proposeRecurringResume','tool-proposeRecurringState','tool-proposeRecurring','tool-proposeCorrection','tool-proposeRefund','tool-proposeSettlement','tool-proposeExpense','tool-generateMealProposal','tool-replaceProposalMeal','tool-chooseProposalRecipe','tool-discardMealProposal','tool-editMealPreparation','tool-createMealPreparation','tool-placeLeftovers','tool-placeRecipe','tool-replaceWithRecipe','tool-editRecipe','tool-archiveRecipe','tool-createRecipe','tool-replaceMeal','tool-moveMeal','tool-removeMeal','tool-placeMeal','tool-completeChore','tool-addGrocery','tool-editGrocery','tool-removeGrocery','tool-checkGrocery','tool-saveFoodPreferences','tool-saveCookingPreferences','tool-proposeMemory','tool-removeMemory','tool-saveNotificationPreferences','tool-createRoutine','tool-editRoutine','tool-setRoutineState','tool-skipChore','tool-rescheduleChore','tool-requestChoreTransfer','tool-respondChoreTransfer');
  return jsonb_set(p_response,'{parts}',v_parts||v_journal);
end;
$$;
