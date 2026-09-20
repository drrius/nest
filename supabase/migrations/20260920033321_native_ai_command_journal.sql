-- GATED additive candidate. No deployment or production application is authorized.
-- Command effects and their journal result commit in one transaction under the
-- conversation lock. Turn finalization/recovery cannot overtake an in-flight write.
create table public.nest_ai_commands (
  conversation_id uuid not null,
  turn_id uuid not null,
  actor_id uuid not null,
  household_id uuid not null,
  tool_call_id text not null check(length(trim(tool_call_id)) between 1 and 200),
  tool_name text not null check(tool_name in ('completeChore','addGrocery','editGrocery','removeGrocery','checkGrocery')),
  input jsonb not null check(jsonb_typeof(input)='object' and octet_length(input::text)<=65536),
  operation_id uuid not null,
  result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=131072),
  sequence bigint generated always as identity,
  created_at timestamptz not null default clock_timestamp(),
  primary key(conversation_id,turn_id,tool_call_id),
  unique(actor_id,household_id,operation_id),
  foreign key(conversation_id,turn_id) references public.nest_ai_turns(conversation_id,operation_id),
  foreign key(conversation_id,actor_id,household_id) references public.nest_ai_conversations(id,actor_id,household_id)
);
alter table public.nest_ai_commands enable row level security;
revoke all on public.nest_ai_commands from public,anon,authenticated;
grant select on public.nest_ai_commands to authenticated;
create policy own_ai_commands on public.nest_ai_commands for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.user_id=(select auth.uid()) and m.household_id=nest_ai_commands.household_id));

create function private.nest_validate_ai_command(p_tool text,p_input jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare v_keys text[]; v_key text; v_type text;
begin
  v_keys:=case p_tool
    when 'completeChore' then array['occurrenceId','expectedDueDate','completedOn']
    when 'addGrocery' then array['name','quantity','unit','categoryId']
    when 'editGrocery' then array['itemId','expectedVersion','name','quantity','unit','categoryId']
    when 'removeGrocery' then array['itemId','expectedVersion']
    when 'checkGrocery' then array['itemId','expectedVersion','checked'] end;
  if v_keys is null or p_input is null or jsonb_typeof(p_input)<>'object'
    or octet_length(p_input::text)>65536 or not (p_input ?& v_keys) or p_input-v_keys<>'{}'::jsonb then
    raise exception 'Invalid AI command' using errcode='22023';
  end if;
  foreach v_key in array v_keys loop
    v_type:=jsonb_typeof(p_input->v_key);
    if v_key<>'checked' and not (v_type='string' or
      (v_type='null' and v_key in ('quantity','unit','categoryId'))) then
      raise exception 'Invalid command field type' using errcode='22023';
    end if;
  end loop;
  if p_tool='completeChore' and (p_input->>'expectedDueDate' !~ '^\d{4}-\d{2}-\d{2}$'
    or p_input->>'completedOn' !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'Invalid command date' using errcode='22023';
  end if;
  if p_input ? 'expectedVersion' and (jsonb_typeof(p_input->'expectedVersion')<>'string'
    or p_input->>'expectedVersion' !~ '^[1-9][0-9]{0,18}$') then
    raise exception 'Invalid command version' using errcode='22023';
  end if;
  if p_tool='checkGrocery' and jsonb_typeof(p_input->'checked')<>'boolean' then
    raise exception 'Invalid check state' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.nest_validate_ai_command(text,jsonb) from public,anon,authenticated;

create function private.nest_dispatch_ai_command(p_household uuid,p_operation uuid,p_tool text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_target uuid; v_action text;
begin
  -- This internal dispatcher is never directly executable by a client.
  if p_tool='completeChore' then
    v_target:=(p_input->>'occurrenceId')::uuid;
    if not exists(select 1 from public.routine_occurrences where id=v_target and household_id=p_household) then
      raise exception 'Not authorized' using errcode='42501';
    end if;
    return private.nest_complete_chore(v_target,p_operation,
      (p_input->>'expectedDueDate')::date,(p_input->>'completedOn')::date);
  end if;
  v_target:=case when p_tool='addGrocery' then gen_random_uuid() else (p_input->>'itemId')::uuid end;
  if p_tool='checkGrocery' then
    return private.nest_set_grocery_checked(p_household,p_operation,v_target,
      (p_input->>'expectedVersion')::bigint,(p_input->>'checked')::boolean);
  end if;
  v_action:=case p_tool when 'addGrocery' then 'add' when 'editGrocery' then 'edit' when 'removeGrocery' then 'remove' end;
  if v_action is null then raise exception 'Unsupported AI command' using errcode='22023'; end if;
  return private.nest_edit_grocery(p_household,p_operation,v_action,v_target,
    (p_input->>'expectedVersion')::bigint,p_input->>'name',p_input->>'quantity',p_input->>'unit',
    (p_input->>'categoryId')::uuid);
end;
$$;
revoke all on function private.nest_dispatch_ai_command(uuid,uuid,text,jsonb) from public,anon,authenticated;

create function private.nest_execute_ai_command(
  p_household uuid,p_conversation uuid,p_turn uuid,p_call text,p_tool text,p_input jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_turn public.nest_ai_turns; v_prior public.nest_ai_commands;
  v_operation uuid:=gen_random_uuid(); v_result jsonb; v_count bigint; v_bytes bigint;
begin
  perform private.nest_lock_ai_conversation(p_household,p_conversation);
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
  select count(*),coalesce(sum(octet_length(input::text)+octet_length(result::text)),0)
    into v_count,v_bytes from public.nest_ai_commands
    where conversation_id=p_conversation and turn_id=p_turn;
  if v_count>=32 then raise exception 'AI command limit reached' using errcode='22023'; end if;
  begin
    v_result:=jsonb_build_object('ok',true,'value',private.nest_dispatch_ai_command(p_household,v_operation,p_tool,p_input));
  exception
    when serialization_failure or no_data_found then v_result:=jsonb_build_object('ok',false,'code','conflict');
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
revoke all on function private.nest_execute_ai_command(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.nest_execute_ai_command(uuid,uuid,uuid,text,text,jsonb) to authenticated;
create function public.nest_execute_ai_command(
  p_household uuid,p_conversation uuid,p_turn uuid,p_call text,p_tool text,p_input jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_execute_ai_command($1,$2,$3,$4,$5,$6);
$$;
revoke all on function public.nest_execute_ai_command(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.nest_execute_ai_command(uuid,uuid,uuid,text,text,jsonb) to authenticated;

-- Rebuild write-tool parts from committed journal facts, including recovery after
-- a process died before saving the streamed assistant message. SDK parts are not
-- evidence that a mutation committed and cannot replace the journal result.
create function private.nest_ai_command_response(p_turn public.nest_ai_turns,p_response jsonb)
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
      ('tool-completeChore','tool-addGrocery','tool-editGrocery','tool-removeGrocery','tool-checkGrocery');
  return jsonb_set(p_response,'{parts}',v_parts||v_journal);
end;
$$;
revoke all on function private.nest_ai_command_response(public.nest_ai_turns,jsonb) from public,anon,authenticated;

create or replace function private.nest_finish_ai_turn(
  p_household uuid,p_conversation uuid,p_operation uuid,p_state text,p_response jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.nest_ai_conversations; v_turn public.nest_ai_turns; v_hash bytea; v_transcript jsonb;
begin
  if p_state is null or p_state not in ('completed','interrupted') then
    raise exception 'Invalid AI turn state' using errcode='22023';
  end if;
  v_row:=private.nest_lock_ai_conversation(p_household,p_conversation);
  select * into v_turn from public.nest_ai_turns where conversation_id=p_conversation and operation_id=p_operation for update;
  if not found then raise exception 'AI turn not found' using errcode='P0002'; end if;
  if p_response is null then
    if p_state<>'interrupted' then raise exception 'Assistant response required' using errcode='22023'; end if;
  elsif jsonb_typeof(p_response) is distinct from 'object'
    or p_response->>'role' is distinct from 'assistant'
    or p_response->>'id' is distinct from v_turn.assistant_id::text
    or jsonb_typeof(p_response->'parts') is distinct from 'array' then
    raise exception 'Invalid assistant response' using errcode='22023';
  end if;
  p_response:=private.nest_ai_command_response(v_turn,p_response);
  v_hash:=sha256(convert_to(jsonb_build_object('state',p_state,'response',p_response)::text,'UTF8'));
  if v_turn.state<>'running' then
    if v_turn.finish_hash<>v_hash then raise exception 'AI turn result changed' using errcode='22023'; end if;
    return private.nest_turn_result(v_turn,false);
  end if;
  if p_state='completed' and clock_timestamp()>=v_turn.deadline_at then
    raise exception 'AI turn expired' using errcode='40001';
  end if;
  if v_row.revision<>v_turn.input_revision then raise exception 'Conversation changed' using errcode='40001'; end if;
  v_transcript:=case when p_response is null then v_row.transcript else v_row.transcript||jsonb_build_array(p_response) end;
  perform private.nest_validate_transcript(1,v_transcript,p_conversation,p_operation,v_row.revision);
  update public.nest_ai_turns set state=p_state,finish_hash=v_hash,final_revision=v_row.revision+1
    where conversation_id=p_conversation and operation_id=p_operation returning * into v_turn;
  update public.nest_ai_conversations set transcript=v_transcript,revision=revision+1,
    updated_at=clock_timestamp() where id=p_conversation;
  return private.nest_turn_result(v_turn,false);
end;
$$;

create or replace function private.nest_begin_ai_turn(
  p_household uuid,p_conversation uuid,p_operation uuid,p_expected bigint,p_message jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.nest_ai_conversations; v_turn public.nest_ai_turns; v_hash bytea; v_transcript jsonb;
begin
  perform private.nest_validate_ai_prompt(p_operation,p_message);
  if p_conversation is null or p_expected is null or p_expected<0 then
    raise exception 'Invalid conversation request' using errcode='22023';
  end if;
  v_row:=private.nest_lock_ai_conversation(p_household,p_conversation);
  v_hash:=sha256(convert_to(jsonb_build_object('expected',p_expected::text,'message',p_message)::text,'UTF8'));
  select * into v_turn from public.nest_ai_turns where conversation_id=p_conversation and operation_id=p_operation;
  if found then
    if v_turn.request_hash<>v_hash then raise exception 'AI turn operation changed' using errcode='22023'; end if;
    return private.nest_turn_result(v_turn,false);
  end if;
  if exists(select 1 from public.nest_ai_turns where conversation_id=p_conversation and state='running') then
    raise exception 'AI turn already running' using errcode='40001';
  end if;
  if v_row.revision<>p_expected then raise exception 'Conversation changed' using errcode='40001'; end if;
  if exists(select 1 from jsonb_array_elements(v_row.transcript) m where m->>'id'=p_operation::text) then
    raise exception 'Message identity already used' using errcode='22023';
  end if;
  -- Reserve space for the prompt, bounded journal and final assistant response.
  -- Existing exact claims above remain replayable when the conversation is full.
  if jsonb_array_length(v_row.transcript)>=999 or octet_length(v_row.transcript::text)>1835008 then
    raise exception 'Conversation capacity reached' using errcode='22023';
  end if;
  v_transcript:=v_row.transcript||jsonb_build_array(p_message);
  perform private.nest_validate_transcript(1,v_transcript,p_conversation,p_operation,p_expected);
  update public.nest_ai_conversations set transcript=v_transcript,revision=revision+1,
    updated_at=clock_timestamp() where id=p_conversation returning * into v_row;
  insert into public.nest_ai_turns(conversation_id,operation_id,actor_id,household_id,input_revision,request_hash)
    values(p_conversation,p_operation,auth.uid(),p_household,v_row.revision,v_hash) returning * into v_turn;
  return private.nest_turn_result(v_turn,true);
end;
$$;
