-- GATED: models create private refund proposals, never confirmations or ledger postings.
create function private.nest_canonical_refund(p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_base jsonb; v_remaining jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>32768
    or not p_input ?& array['sourceEventId','description','amountCentimes','payerId','allocations','expectedRemaining','date','note']
    or p_input-array['sourceEventId','description','amountCentimes','payerId','allocations','expectedRemaining','date','note']<>'{}'::jsonb then
    raise exception 'Invalid refund input' using errcode='22023'; end if;
  v_base:=private.nest_canonical_expense((p_input-array['sourceEventId','expectedRemaining'])||jsonb_build_object('categoryId',null));
  v_remaining:=private.nest_canonical_expense(v_base||jsonb_build_object('allocations',p_input->'expectedRemaining'));
  return (v_base-'categoryId')||jsonb_build_object('sourceEventId',private.nest_expense_uuid(p_input->'sourceEventId',false),
    'expectedRemaining',v_remaining->'allocations');
end;
$$;
revoke all on function private.nest_canonical_refund(jsonb) from public,anon,authenticated;

create function private.nest_propose_refund(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payload jsonb; v_context jsonb; v_approval uuid; v_members integer;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Refund requires two members' using errcode='23514'; end if;
  v_payload:=private.nest_canonical_refund(p_input);
  perform private.nest_refund_payload(v_payload,p_household);
  if exists(select 1 from jsonb_array_elements(v_payload->'allocations') a
    join jsonb_array_elements(v_payload->'expectedRemaining') r on a->>'memberId'=r->>'memberId'
    where (a->>'centimes')::numeric>(r->>'centimes')::numeric) then
    raise exception 'Invalid refund allocation' using errcode='22023'; end if;
  perform 1 from public.financial_events where household_id=p_household and id=(v_payload->>'sourceEventId')::uuid for update;
  if not found then raise exception 'Refund source unavailable' using errcode='P0002'; end if;
  perform private.lock_household_ledger(p_household);
  v_context:=private.nest_refund_context(p_household,(v_payload->>'sourceEventId')::uuid);
  if not (v_context->>'refundable')::boolean or not ((v_context->'remaining') @> (v_payload->'expectedRemaining'))
    or not ((v_payload->'expectedRemaining') @> (v_context->'remaining'))
    or v_context->'source'->'event'->>'payerId' is distinct from v_payload->>'payerId' then
    raise exception 'Refund source changed; review remaining shares' using errcode='40001'; end if;
  v_approval:=private.nest_propose_action(p_household,p_operation,'expenses.refund',1,v_payload);
  return private.nest_read_refund_approval(p_household,v_approval);
end;
$$;
revoke all on function private.nest_propose_refund(uuid,uuid,jsonb) from public,anon,authenticated;

alter table public.nest_ai_commands drop constraint nest_ai_commands_tool_name_check;
alter table public.nest_ai_commands add constraint nest_ai_commands_tool_name_check
  check(tool_name in ('proposeRefund','proposeSettlement','proposeExpense','generateMealProposal','replaceProposalMeal','chooseProposalRecipe','discardMealProposal','editMealPreparation','createMealPreparation','placeLeftovers','placeRecipe','replaceWithRecipe','editRecipe','archiveRecipe','createRecipe','replaceMeal','moveMeal','removeMeal','placeMeal','completeChore','addGrocery','editGrocery','removeGrocery','checkGrocery',
    'saveFoodPreferences','saveCookingPreferences','proposeMemory','removeMemory','saveNotificationPreferences','createRoutine','editRoutine','setRoutineState','skipChore','rescheduleChore','requestChoreTransfer','respondChoreTransfer'));

create or replace function private.nest_validate_ai_command(p_tool text,p_input jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
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
      ('tool-proposeRefund','tool-proposeSettlement','tool-proposeExpense','tool-generateMealProposal','tool-replaceProposalMeal','tool-chooseProposalRecipe','tool-discardMealProposal','tool-editMealPreparation','tool-createMealPreparation','tool-placeLeftovers','tool-placeRecipe','tool-replaceWithRecipe','tool-editRecipe','tool-archiveRecipe','tool-createRecipe','tool-replaceMeal','tool-moveMeal','tool-removeMeal','tool-placeMeal','tool-completeChore','tool-addGrocery','tool-editGrocery','tool-removeGrocery','tool-checkGrocery','tool-saveFoodPreferences','tool-saveCookingPreferences','tool-proposeMemory','tool-removeMemory','tool-saveNotificationPreferences','tool-createRoutine','tool-editRoutine','tool-setRoutineState','tool-skipChore','tool-rescheduleChore','tool-requestChoreTransfer','tool-respondChoreTransfer');
  return jsonb_set(p_response,'{parts}',v_parts||v_journal);
end;
$$;
