-- GATED additive candidate. No production application is authorized.
-- A memory addition/change always consumes explicit approval of the exact text/version.
alter table public.nest_action_approvals drop constraint nest_action_approvals_command_check;
alter table public.nest_action_approvals add constraint nest_action_approvals_command_check
  check(command in ('expenses.record','expenses.correct','expenses.refund','settlements.record',
    'groceryExpenses.record','recurring.create','recurring.update','recurring.pause','recurring.cancel','memory.save'));

create function private.nest_valid_memory_content(p_content text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_content is not null and length(p_content)<=1000
    and length(p_content)+(select count(*) from regexp_split_to_table(p_content,'') character
      where ascii(character)>65535)<=1000
    and btrim(p_content,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'';
$$;
revoke all on function private.nest_valid_memory_content(text) from public,anon,authenticated;

create table public.nest_memories (
  actor_id uuid not null, household_id uuid not null, id uuid not null,
  revision bigint not null check(revision>0),
  content text check(content is null or private.nest_valid_memory_content(content)),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,id)
);
-- Null content is a deletion marker, not usable memory. Old revisions cannot resurrect it.
create table public.nest_memory_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32),
  memory_id uuid not null, result_revision bigint not null check(result_revision>0),
  removed boolean not null, created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_memories enable row level security;
alter table public.nest_memory_receipts enable row level security;
revoke all on public.nest_memories,public.nest_memory_receipts from public,anon,authenticated;
grant select on public.nest_memories,public.nest_memory_receipts to authenticated;
create policy own_memories on public.nest_memories for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.user_id=(select auth.uid()) and m.household_id=nest_memories.household_id));
create policy own_memory_receipts on public.nest_memory_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and exists(select 1 from public.household_members m
    where m.user_id=(select auth.uid()) and m.household_id=nest_memory_receipts.household_id));

create function private.nest_change_memory(
  p_household uuid,p_operation uuid,p_memory uuid,p_expected bigint,p_content text,p_approval uuid,p_remove boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_memory_receipts;
  v_row public.nest_memories; v_result bigint; v_payload jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_memory is null or p_expected is null or p_expected<0 or p_remove is null
    or (p_remove and (p_content is not null or p_approval is not null or p_expected=0))
    or (not p_remove and (p_approval is null or not private.nest_valid_memory_content(p_content))) then
    raise exception 'Invalid memory command' using errcode='22023';
  end if;
  v_payload:=jsonb_build_object('memoryId',p_memory,'expectedRevision',p_expected::text,'content',p_content);
  v_hash:=sha256(convert_to(jsonb_build_object('payload',v_payload,'approval',p_approval,'remove',p_remove)::text,'UTF8'));
  -- Serializes first saves, quota checks, changes, deletion and all receipt replays for this owner.
  perform pg_advisory_xact_lock(hashtextextended('nest-memory:'||p_household::text||':'||v_actor::text,0));
  select * into v_prior from public.nest_memory_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Memory operation changed' using errcode='22023'; end if;
    v_result:=v_prior.result_revision;
  else
    select * into v_row from public.nest_memories
      where actor_id=v_actor and household_id=p_household and id=p_memory for update;
    if coalesce(v_row.revision,0)<>p_expected or (v_row.revision is not null and v_row.content is null) then
      raise exception 'Memory changed' using errcode='40001';
    end if;
    if not p_remove then
      if v_row.revision is null and (select count(*) from public.nest_memories
        where actor_id=v_actor and household_id=p_household and content is not null)>=64 then
        raise exception 'Memory limit reached' using errcode='54000';
      end if;
      perform private.nest_consume_action_approval(p_approval,p_household,p_operation,'memory.save',1,v_payload);
    end if;
    v_result:=p_expected+1;
    insert into public.nest_memories(actor_id,household_id,id,revision,content)
      values(v_actor,p_household,p_memory,v_result,p_content)
      on conflict(actor_id,household_id,id) do update set revision=excluded.revision,
        content=excluded.content,updated_at=clock_timestamp();
    insert into public.nest_memory_receipts(actor_id,household_id,operation_id,request_hash,memory_id,result_revision,removed)
      values(v_actor,p_household,p_operation,v_hash,p_memory,v_result,p_remove);
  end if;
  return jsonb_build_object('actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'memoryId',p_memory,'revision',v_result::text,'removed',p_remove);
end;
$$;
revoke all on function private.nest_change_memory(uuid,uuid,uuid,bigint,text,uuid,boolean) from public,anon,authenticated;

create function private.nest_save_memory(p_household uuid,p_operation uuid,p_memory uuid,p_expected bigint,p_content text,p_approval uuid)
returns jsonb language sql security definer set search_path='' as $$
  select private.nest_change_memory($1,$2,$3,$4,$5,$6,false);
$$;
create function private.nest_remove_memory(p_household uuid,p_operation uuid,p_memory uuid,p_expected bigint)
returns jsonb language sql security definer set search_path='' as $$
  select private.nest_change_memory($1,$2,$3,$4,null,null,true);
$$;
revoke all on function private.nest_save_memory(uuid,uuid,uuid,bigint,text,uuid) from public,anon,authenticated;
revoke all on function private.nest_remove_memory(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function private.nest_save_memory(uuid,uuid,uuid,bigint,text,uuid) to authenticated;
grant execute on function private.nest_remove_memory(uuid,uuid,uuid,bigint) to authenticated;
create function public.nest_save_memory(p_household uuid,p_operation uuid,p_memory uuid,p_expected bigint,p_content text,p_approval uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_memory($1,$2,$3,$4,$5,$6);
$$;
create function public.nest_remove_memory(p_household uuid,p_operation uuid,p_memory uuid,p_expected bigint)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_remove_memory($1,$2,$3,$4);
$$;
revoke all on function public.nest_save_memory(uuid,uuid,uuid,bigint,text,uuid) from public,anon,authenticated;
revoke all on function public.nest_remove_memory(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.nest_save_memory(uuid,uuid,uuid,bigint,text,uuid) to authenticated;
grant execute on function public.nest_remove_memory(uuid,uuid,uuid,bigint) to authenticated;
