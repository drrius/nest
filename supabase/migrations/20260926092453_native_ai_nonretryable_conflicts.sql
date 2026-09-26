-- Preserve terminal private AI journal results for non-retryable business conflicts.
create or replace function private.nest_execute_ai_command(
  p_household uuid,p_conversation uuid,p_turn uuid,p_call text,p_tool text,p_input jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_turn public.nest_ai_turns; v_prior public.nest_ai_commands; v_row public.nest_ai_conversations;
  v_operation uuid:=gen_random_uuid(); v_result jsonb; v_count bigint; v_bytes bigint;
begin
  v_row:=private.nest_lock_ai_conversation(p_household,p_conversation);
  select * into v_turn from public.nest_ai_turns
    where conversation_id=p_conversation and operation_id=p_turn for update;
  if not found then raise exception 'AI turn not found' using errcode='P0002'; end if;
  if p_call is null or length(trim(p_call)) not between 1 and 200 then
    raise exception 'Invalid tool call' using errcode='22023';
  end if;
  perform private.nest_validate_ai_command(p_tool,p_input);
  select * into v_prior from public.nest_ai_commands
    where conversation_id=p_conversation and turn_id=p_turn and tool_call_id=p_call;
  if found then
    if v_prior.tool_name is distinct from p_tool or v_prior.input is distinct from p_input then
      raise exception 'AI command changed' using errcode='22023';
    end if;
    return v_prior.result;
  end if;
  if v_turn.state<>'running' or clock_timestamp()>=v_turn.deadline_at then
    raise exception 'AI turn no longer active' using errcode='40001';
  end if;
  -- Claims accepted before this migration did not reserve recovery headroom.
  if jsonb_array_length(v_row.transcript)>=1000 or octet_length(v_row.transcript::text)>1867776 then
    raise exception 'Conversation capacity reached' using errcode='22023';
  end if;
  select count(*),coalesce(sum(octet_length(input::text)+octet_length(result::text)),0)
    into v_count,v_bytes from public.nest_ai_commands
    where conversation_id=p_conversation and turn_id=p_turn;
  if v_count>=32 then raise exception 'AI command limit reached' using errcode='22023'; end if;
  begin
    v_result:=jsonb_build_object('ok',true,'value',private.nest_dispatch_ai_command(p_household,v_operation,p_tool,p_input));
  exception
    when sqlstate 'PT412' or serialization_failure or no_data_found then v_result:=jsonb_build_object('ok',false,'code','conflict');
    when insufficient_privilege then v_result:=jsonb_build_object('ok',false,'code','forbidden');
  end;
  -- Raising outside the dispatch exception block rolls back the effect and native receipt.
  if v_bytes+octet_length(p_input::text)+octet_length(v_result::text)>131072 then
    raise exception 'AI command journal full' using errcode='22023';
  end if;
  insert into public.nest_ai_commands(conversation_id,turn_id,actor_id,household_id,tool_call_id,tool_name,input,operation_id,result)
    values(p_conversation,p_turn,auth.uid(),p_household,p_call,p_tool,p_input,v_operation,v_result);
  return v_result;
end;
$$;
