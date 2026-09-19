-- GATED: owner-private, versioned server transcripts. SDK validation belongs at the API.
create table public.nest_ai_conversations (
  id uuid primary key,
  actor_id uuid not null,
  household_id uuid not null,
  schema_version integer not null default 1 check(schema_version=1),
  revision bigint not null default 0 check(revision>=0),
  transcript jsonb not null default '[]'::jsonb
    check(jsonb_typeof(transcript)='array' and octet_length(transcript::text)<=2097152),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(id,actor_id,household_id)
);
create table public.nest_ai_conversation_saves (
  conversation_id uuid not null,
  actor_id uuid not null,
  household_id uuid not null,
  operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32),
  result_revision bigint not null check(result_revision>0),
  created_at timestamptz not null default clock_timestamp(),
  primary key(conversation_id,operation_id),
  foreign key(conversation_id,actor_id,household_id)
    references public.nest_ai_conversations(id,actor_id,household_id) on delete cascade
);
alter table public.nest_ai_conversations enable row level security;
alter table public.nest_ai_conversation_saves enable row level security;
revoke all on public.nest_ai_conversations,public.nest_ai_conversation_saves from public,anon,authenticated;
grant select on public.nest_ai_conversations,public.nest_ai_conversation_saves to authenticated;
create policy own_ai_conversations on public.nest_ai_conversations for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.household_id=nest_ai_conversations.household_id and m.user_id=(select auth.uid())));
create policy own_ai_conversation_saves on public.nest_ai_conversation_saves for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.household_id=nest_ai_conversation_saves.household_id and m.user_id=(select auth.uid())));

create function private.nest_validate_transcript(
  p_schema integer,p_transcript jsonb,p_conversation uuid,p_operation uuid,p_expected bigint
)
  returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_conversation is null or p_operation is null or p_expected is null or p_expected<0 then
    raise exception 'Invalid conversation request' using errcode='22023';
  end if;
  if p_schema is distinct from 1 or jsonb_typeof(p_transcript) is distinct from 'array' then
    raise exception 'Unsupported transcript envelope' using errcode='22023';
  end if;
  if jsonb_array_length(p_transcript)>1000 or octet_length(p_transcript::text)>2097152 then
    raise exception 'Transcript too large' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.nest_validate_transcript(integer,jsonb,uuid,uuid,bigint) from public,anon,authenticated;

create function private.nest_save_conversation(
  p_household uuid,p_conversation uuid,p_operation uuid,p_expected bigint,p_schema integer,p_transcript jsonb
) returns text language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_row public.nest_ai_conversations;
  v_save public.nest_ai_conversation_saves;
  v_hash bytea;
begin
  perform 1 from public.household_members
    where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  perform private.nest_validate_transcript(p_schema,p_transcript,p_conversation,p_operation,p_expected);
  insert into public.nest_ai_conversations(id,actor_id,household_id) values(p_conversation,v_actor,p_household)
    on conflict(id) do nothing;
  select * into v_row from public.nest_ai_conversations
    where id=p_conversation and actor_id=v_actor and household_id=p_household for update;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  v_hash:=sha256(convert_to(jsonb_build_object('expected',p_expected::text,
    'schema',p_schema,'transcript',p_transcript)::text,'UTF8'));
  select * into v_save from public.nest_ai_conversation_saves
    where conversation_id=p_conversation and operation_id=p_operation;
  if found then
    if v_save.request_hash is distinct from v_hash then
      raise exception 'Conversation operation changed' using errcode='22023';
    end if;
    return v_save.result_revision::text;
  end if;
  if v_row.revision<>p_expected then
    raise exception 'Conversation changed' using errcode='40001';
  end if;
  update public.nest_ai_conversations set transcript=p_transcript,schema_version=p_schema,
    revision=revision+1,updated_at=clock_timestamp() where id=p_conversation returning * into v_row;
  insert into public.nest_ai_conversation_saves(conversation_id,actor_id,household_id,operation_id,request_hash,result_revision)
    values(p_conversation,v_actor,p_household,p_operation,v_hash,v_row.revision);
  return v_row.revision::text;
end;
$$;
revoke all on function private.nest_save_conversation(uuid,uuid,uuid,bigint,integer,jsonb) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.nest_save_conversation(uuid,uuid,uuid,bigint,integer,jsonb) to authenticated;
create function public.nest_save_conversation(
  p_household uuid,p_conversation uuid,p_operation uuid,p_expected bigint,p_schema integer,p_transcript jsonb
) returns text language sql security invoker set search_path='' as $$
  select private.nest_save_conversation($1,$2,$3,$4,$5,$6);
$$;
revoke all on function public.nest_save_conversation(uuid,uuid,uuid,bigint,integer,jsonb) from public,anon,authenticated;
grant execute on function public.nest_save_conversation(uuid,uuid,uuid,bigint,integer,jsonb) to authenticated;
