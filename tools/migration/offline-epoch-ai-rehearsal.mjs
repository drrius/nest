import { id } from "../../tests/database/native-expense-helpers.mjs";

// Only called by the disposable full-schema rehearsal. Every effect rolls back.
export function verifyOfflineEpochAi(db) {
  db.sql(`begin;
    select private.nest_set_household_writes_frozen(true);
    select private.nest_rotate_offline_epoch();
    select private.nest_set_household_writes_frozen(false);
    set local role authenticated;
    set local request.jwt.claim.sub='${id(1)}';
    do $verify$ declare
      v_conversation uuid:=gen_random_uuid(); v_turn uuid:=gen_random_uuid();
      v_item uuid:=gen_random_uuid(); v_routine jsonb; v_occurrence jsonb;
      v_input jsonb; v_result jsonb; v_again jsonb;
    begin
      v_routine:=public.nest_create_routine('${id(10)}',gen_random_uuid(),
        '{"title":"Synthetic epoch chore","schedule":{"kind":"daily"},"assignment":{"policy":"shared"}}');
      select to_jsonb(o) into strict v_occurrence from public.routine_occurrences o
        where routine_id=(v_routine->>'routineId')::uuid and role='current';
      perform public.nest_edit_grocery('${id(10)}',gen_random_uuid(),'add',v_item,null,
        'Synthetic epoch grocery',null,null,null);
      perform public.nest_begin_ai_turn('${id(10)}',v_conversation,v_turn,0,
        jsonb_build_object('id',v_turn,'role','user','parts',jsonb_build_array(
          jsonb_build_object('type','text','text','Complete the fixture chore and check the fixture grocery'))));
      v_input:=jsonb_build_object('occurrenceId',v_occurrence->>'id',
        'expectedDueDate',v_occurrence->>'due_date','completedOn',v_occurrence->>'due_date');
      v_result:=public.nest_execute_ai_command('${id(10)}',v_conversation,v_turn,'epoch-chore','completeChore',v_input);
      v_again:=public.nest_execute_ai_command('${id(10)}',v_conversation,v_turn,'epoch-chore','completeChore',v_input);
      if v_result->>'ok' is distinct from 'true' or v_again is distinct from v_result then
        raise exception 'Epoch AI chore execution/replay failed: %',v_result;
      end if;
      v_input:=jsonb_build_object('itemId',v_item,'expectedVersion','1','checked',true);
      v_result:=public.nest_execute_ai_command('${id(10)}',v_conversation,v_turn,'epoch-check','checkGrocery',v_input);
      v_again:=public.nest_execute_ai_command('${id(10)}',v_conversation,v_turn,'epoch-check','checkGrocery',v_input);
      if v_result->>'ok' is distinct from 'true' or v_again is distinct from v_result then
        raise exception 'Epoch AI grocery execution/replay failed: %',v_result;
      end if;
      if (select count(*) from public.nest_ai_commands where conversation_id=v_conversation)<>2
        or (select count(*) from public.routine_completions where occurrence_id=(v_occurrence->>'id')::uuid)<>1
        or not exists(select 1 from public.grocery_items where id=v_item and native_checked and native_version=2) then
        raise exception 'Epoch AI side effects or journal duplicated';
      end if;
      if has_function_privilege(current_user,
        'private.nest_dispatch_ai_basic_command(uuid,uuid,text,jsonb)','EXECUTE') then
        raise exception 'AI dispatcher exposed to client';
      end if;
    end; $verify$;
    rollback;`);
  return { postRotationChoreAndCheck: true, exactJournalReplay: true, fixtureRolledBack: true };
}
