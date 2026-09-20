-- GATED additive migration: no production execution is authorized.
do $$
begin
  if to_regclass('public.nest_ai_conversations') is null then
    raise exception 'Nest requires the private conversation baseline' using errcode='55000';
  end if;
end;
$$;

create table public.nest_ai_turns (
  conversation_id uuid not null,
  operation_id uuid not null,
  actor_id uuid not null,
  household_id uuid not null,
  assistant_id uuid not null default gen_random_uuid(),
  request_hash bytea not null check(octet_length(request_hash)=32),
  input_revision bigint not null check(input_revision>0),
  state text not null default 'running' check(state in ('running','completed','interrupted')),
  started_at timestamptz not null default clock_timestamp(),
  deadline_at timestamptz not null default (clock_timestamp()+interval '2 minutes'),
  finish_hash bytea check(octet_length(finish_hash)=32),
  final_revision bigint,
  primary key(conversation_id,operation_id),
  foreign key(conversation_id,actor_id,household_id)
    references public.nest_ai_conversations(id,actor_id,household_id) on delete cascade,
  check((state='running' and finish_hash is null and final_revision is null)
    or (state<>'running' and finish_hash is not null and final_revision>input_revision))
);
create unique index nest_one_running_ai_turn on public.nest_ai_turns(conversation_id) where state='running';
alter table public.nest_ai_turns enable row level security;
revoke all on public.nest_ai_turns from public,anon,authenticated;
grant select on public.nest_ai_turns to authenticated;
create policy own_ai_turns on public.nest_ai_turns for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.household_id=nest_ai_turns.household_id and m.user_id=(select auth.uid())));

create function private.nest_lock_ai_conversation(p_household uuid,p_conversation uuid)
returns public.nest_ai_conversations language plpgsql security definer set search_path='' as $$
declare v_row public.nest_ai_conversations;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  insert into public.nest_ai_conversations(id,actor_id,household_id) values(p_conversation,auth.uid(),p_household)
    on conflict do nothing;
  select * into v_row from public.nest_ai_conversations where id=p_conversation
    and actor_id=auth.uid() and household_id=p_household for update;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  return v_row;
end;
$$;
revoke all on function private.nest_lock_ai_conversation(uuid,uuid) from public,anon,authenticated;

create function private.nest_validate_ai_prompt(p_operation uuid,p_message jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_operation is null or jsonb_typeof(p_message) is distinct from 'object'
    or p_message->>'id' is distinct from p_operation::text
    or p_message->>'role' is distinct from 'user'
    or jsonb_typeof(p_message->'parts') is distinct from 'array' then
    raise exception 'Invalid user message' using errcode='22023';
  end if;
  if jsonb_array_length(p_message->'parts')<>1
    or p_message->'parts'->0->>'type' is distinct from 'text'
    or jsonb_typeof(p_message->'parts'->0->'text') is distinct from 'string'
    or length(btrim(p_message->'parts'->0->>'text'))=0
    or octet_length(p_message::text)>32768 then
    raise exception 'Invalid user message' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.nest_validate_ai_prompt(uuid,jsonb) from public,anon,authenticated;

create function private.nest_turn_result(p_turn public.nest_ai_turns,p_claimed boolean)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('claimed',p_claimed,'state',p_turn.state,'assistantId',p_turn.assistant_id,
    'inputRevision',p_turn.input_revision::text,'finalRevision',p_turn.final_revision::text,
    'deadline',p_turn.deadline_at);
$$;
revoke all on function private.nest_turn_result(public.nest_ai_turns,boolean) from public,anon,authenticated;

create function private.nest_begin_ai_turn(
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
  v_transcript:=v_row.transcript||jsonb_build_array(p_message);
  perform private.nest_validate_transcript(1,v_transcript,p_conversation,p_operation,p_expected);
  update public.nest_ai_conversations set transcript=v_transcript,revision=revision+1,
    updated_at=clock_timestamp() where id=p_conversation returning * into v_row;
  insert into public.nest_ai_turns(conversation_id,operation_id,actor_id,household_id,input_revision,request_hash)
    values(p_conversation,p_operation,auth.uid(),p_household,v_row.revision,v_hash) returning * into v_turn;
  return private.nest_turn_result(v_turn,true);
end;
$$;
revoke all on function private.nest_begin_ai_turn(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function private.nest_begin_ai_turn(uuid,uuid,uuid,bigint,jsonb) to authenticated;
create function public.nest_begin_ai_turn(
  p_household uuid,p_conversation uuid,p_operation uuid,p_expected bigint,p_message jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_begin_ai_turn($1,$2,$3,$4,$5);
$$;
revoke all on function public.nest_begin_ai_turn(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.nest_begin_ai_turn(uuid,uuid,uuid,bigint,jsonb) to authenticated;

create function private.nest_finish_ai_turn(
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
revoke all on function private.nest_finish_ai_turn(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.nest_finish_ai_turn(uuid,uuid,uuid,text,jsonb) to authenticated;
create function public.nest_finish_ai_turn(
  p_household uuid,p_conversation uuid,p_operation uuid,p_state text,p_response jsonb
) returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_finish_ai_turn($1,$2,$3,$4,$5);
$$;
revoke all on function public.nest_finish_ai_turn(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.nest_finish_ai_turn(uuid,uuid,uuid,text,jsonb) to authenticated;

-- Existing transcript saves cannot overwrite a running turn. Finalization marks
-- the turn terminal under the same conversation lock before updating the history.
create function private.nest_guard_running_transcript()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.nest_ai_turns where conversation_id=new.id and state='running') then
    raise exception 'AI turn already running' using errcode='40001';
  end if;
  return new;
end;
$$;
revoke all on function private.nest_guard_running_transcript() from public,anon,authenticated;
create trigger nest_guard_running_transcript before update of transcript on public.nest_ai_conversations
  for each row execute function private.nest_guard_running_transcript();
