-- GATED additive candidate. Journal only private proposal reservations/edits/discard.
-- Model work starts after journal commit; proposal approval remains a native-only command.
alter table public.nest_ai_commands drop constraint nest_ai_commands_tool_name_check;
alter table public.nest_ai_commands add constraint nest_ai_commands_tool_name_check
  check(tool_name in ('generateMealProposal','replaceProposalMeal','chooseProposalRecipe','discardMealProposal','editMealPreparation','createMealPreparation','placeLeftovers','placeRecipe','replaceWithRecipe','editRecipe','archiveRecipe','createRecipe','replaceMeal','moveMeal','removeMeal','placeMeal','completeChore','addGrocery','editGrocery','removeGrocery','checkGrocery',
    'saveFoodPreferences','saveCookingPreferences','proposeMemory','removeMemory','saveNotificationPreferences','createRoutine','editRoutine','setRoutineState','skipChore','rescheduleChore','requestChoreTransfer','respondChoreTransfer'));

create or replace function private.nest_validate_ai_meal_command(p_tool text,p_input jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_tool='generateMealProposal' then
    perform private.nest_meal_proposal_input(p_input,false);
    return;
  end if;
  if p_tool='discardMealProposal' then
    perform private.nest_meal_proposal_input(p_input,true);
    return;
  end if;
  if p_tool in ('replaceProposalMeal','chooseProposalRecipe') then
    if p_input ? 'action' then raise exception 'Invalid proposal edit' using errcode='22023'; end if;
    perform private.nest_proposal_edit_input(p_input||jsonb_build_object('action',
      case when p_tool='replaceProposalMeal' then 'replace' else 'choose' end));
    return;
  end if;
  if p_tool='editMealPreparation' then
    perform private.nest_meal_preparation_edit_input(p_input);
    return;
  end if;
  if p_tool='createMealPreparation' then
    if p_input is null or jsonb_typeof(p_input) is distinct from 'object'
      or octet_length(p_input::text)>32768 or jsonb_typeof(p_input->'preparation') is distinct from 'object' then
      raise exception 'Invalid preparation command' using errcode='22023';
    end if;
    perform private.nest_meal_removal_input(p_input-'preparation');
    -- Native dispatch strictly validates every nested field and household assignment.
    return;
  end if;
  if p_tool in ('placeRecipe','replaceWithRecipe') then
    perform private.nest_recipe_selection_input(p_input,p_tool='replaceWithRecipe');
    return;
  end if;
  if p_tool='editRecipe' then
    perform private.nest_recipe_edit_input(p_input);
    if octet_length(p_input::text)>65536 then
      raise exception 'Recipe requires native form' using errcode='22023';
    end if;
    return;
  end if;
  if p_tool='archiveRecipe' then
    perform private.nest_recipe_archive_input(p_input);
    return;
  end if;
  if p_tool='createRecipe' then
    perform private.nest_recipe_creation_input(p_input);
    if octet_length(p_input::text)>65536 then
      raise exception 'Recipe requires native form' using errcode='22023';
    end if;
    return;
  end if;
  if p_tool='replaceMeal' then
    perform private.nest_meal_replacement_input(p_input);
    return;
  end if;
  if p_tool in ('moveMeal','placeLeftovers') then
    perform private.nest_meal_move_input(p_input);
    return;
  end if;
  if p_tool='removeMeal' then
    perform private.nest_meal_removal_input(p_input);
    return;
  end if;
  if p_tool='placeMeal' then
    perform private.nest_meal_placement_input(p_input);
    return;
  end if;
end;
$$;
revoke all on function private.nest_validate_ai_meal_command(text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.nest_validate_ai_command(p_tool text,p_input jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
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
create function private.nest_dispatch_ai_proposal(p_household uuid,p_operation uuid,p_tool text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_tool='generateMealProposal' then
    return private.nest_begin_meal_proposal(p_household,p_operation,p_input);
  end if;
  if p_tool='discardMealProposal' then
    return private.nest_discard_meal_proposal(p_household,p_operation,
      jsonb_set(p_input,'{proposalId}',to_jsonb(lower(p_input->>'proposalId'))));
  end if;
  if p_tool in ('replaceProposalMeal','chooseProposalRecipe') then
    return private.nest_begin_proposal_edit(p_household,p_operation,p_input||jsonb_build_object('action',
      case when p_tool='replaceProposalMeal' then 'replace' else 'choose' end));
  end if;
  raise exception 'Invalid proposal command' using errcode='22023';
exception when object_not_in_prerequisite_state or lock_not_available then
  raise exception 'Proposal context changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_dispatch_ai_proposal(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.nest_dispatch_ai_meal(p_household uuid,p_operation uuid,p_tool text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_tool in ('generateMealProposal','replaceProposalMeal','chooseProposalRecipe','discardMealProposal') then
    return private.nest_dispatch_ai_proposal(p_household,p_operation,p_tool,p_input);
  end if;
  if p_tool='editMealPreparation' then
    return private.nest_edit_meal_preparation(p_household,p_operation,
      jsonb_set(jsonb_set(p_input,'{entryId}',to_jsonb(lower(p_input->>'entryId'))),
        '{routineId}',to_jsonb(lower(p_input->>'routineId'))));
  end if;
  if p_tool='createMealPreparation' then
    return private.nest_create_meal_preparation(p_household,p_operation,
      jsonb_set(p_input,'{entryId}',to_jsonb(lower(p_input->>'entryId'))));
  end if;
  if p_tool in ('placeRecipe','replaceWithRecipe','editRecipe','archiveRecipe','createRecipe') then
    return private.nest_dispatch_ai_recipe(p_household,p_operation,p_tool,p_input);
  end if;
  if p_tool='replaceMeal' then
    return private.nest_replace_meal(p_household,p_operation,
      jsonb_set(p_input,'{entryId}',to_jsonb(lower(p_input->>'entryId'))));
  end if;
  if p_tool='placeLeftovers' then
    return private.nest_place_leftovers(p_household,p_operation,
      jsonb_set(p_input,'{entryId}',to_jsonb(lower(p_input->>'entryId'))));
  end if;
  if p_tool='moveMeal' then
    return private.nest_move_meal(p_household,p_operation,
      jsonb_set(p_input,'{entryId}',to_jsonb(lower(p_input->>'entryId'))));
  end if;
  if p_tool='removeMeal' then
    return private.nest_remove_meal(p_household,p_operation,
      jsonb_set(p_input,'{entryId}',to_jsonb(lower(p_input->>'entryId'))));
  end if;
  if p_tool='placeMeal' then
    return private.nest_place_meal(p_household,p_operation,p_input);
  end if;
  raise exception 'Invalid meal command' using errcode='22023';
end;
$$;
revoke all on function private.nest_dispatch_ai_meal(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

create or replace function private.nest_dispatch_ai_command(p_household uuid,p_operation uuid,p_tool text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
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
      ('tool-generateMealProposal','tool-replaceProposalMeal','tool-chooseProposalRecipe','tool-discardMealProposal','tool-editMealPreparation','tool-createMealPreparation','tool-placeLeftovers','tool-placeRecipe','tool-replaceWithRecipe','tool-editRecipe','tool-archiveRecipe','tool-createRecipe','tool-replaceMeal','tool-moveMeal','tool-removeMeal','tool-placeMeal','tool-completeChore','tool-addGrocery','tool-editGrocery','tool-removeGrocery','tool-checkGrocery','tool-saveFoodPreferences','tool-saveCookingPreferences','tool-proposeMemory','tool-removeMemory','tool-saveNotificationPreferences','tool-createRoutine','tool-editRoutine','tool-setRoutineState','tool-skipChore','tool-rescheduleChore','tool-requestChoreTransfer','tool-respondChoreTransfer');
  return jsonb_set(p_response,'{parts}',v_parts||v_journal);
end;
$$;
