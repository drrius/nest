-- GATED additive candidate. No transfer changes responsibility before recipient acceptance.
create function private.nest_request_chore_transfer(p_household uuid,p_occurrence uuid,p_due date,p_recipient uuid)
returns public.nest_chore_transfers language plpgsql security definer set search_path='' as $$
declare v_occurrence public.routine_occurrences; v_request public.nest_chore_transfers; v_owner uuid;
begin
  select * into v_occurrence from public.routine_occurrences
    where id=p_occurrence and household_id=p_household for update;
  if not found then raise exception 'Chore unavailable' using errcode='42501'; end if;
  v_owner:=coalesce(v_occurrence.nest_accepted_assignee_id,v_occurrence.planned_assignee_id);
  if v_owner is distinct from auth.uid() or p_recipient=auth.uid() then
    raise exception 'Only the responsible member can request a handover' using errcode='42501';
  end if;
  if v_occurrence.status<>'open' or v_occurrence.role is distinct from 'current'
    or v_occurrence.due_date<>p_due then raise exception 'Chore changed' using errcode='40001'; end if;
  perform 1 from public.routines where id=v_occurrence.routine_id and household_id=p_household
    and archived_at is null and paused_at is null for update nowait;
  if not found then raise exception 'Chore changed' using errcode='40001'; end if;
  if not exists(select 1 from public.household_members where household_id=p_household and user_id=p_recipient) then
    raise exception 'Recipient unavailable' using errcode='42501';
  end if;
  select * into v_request from public.nest_chore_transfers
    where household_id=p_household and occurrence_id=p_occurrence and state='pending' for update;
  if found then
    if v_request.expected_assignment_revision=v_occurrence.nest_assignment_revision
      and v_request.expected_due_date=p_due and v_request.from_member_id=v_owner
      and v_request.to_member_id=p_recipient then return v_request; end if;
    update public.nest_chore_transfers set state='superseded',resolved_at=clock_timestamp() where id=v_request.id;
  end if;
  insert into public.nest_chore_transfers(household_id,occurrence_id,expected_due_date,
    expected_assignment_revision,from_member_id,to_member_id)
    values(p_household,p_occurrence,p_due,v_occurrence.nest_assignment_revision,v_owner,p_recipient)
    returning * into v_request;
  return v_request;
end;
$$;
revoke all on function private.nest_request_chore_transfer(uuid,uuid,date,uuid) from public,anon,authenticated;

create function private.nest_respond_chore_transfer(p_household uuid,p_request uuid,p_action text)
returns public.nest_chore_transfers language plpgsql security definer set search_path='' as $$
declare v_request public.nest_chore_transfers; v_occurrence public.routine_occurrences;
begin
  select * into v_request from public.nest_chore_transfers where id=p_request and household_id=p_household;
  if not found or v_request.to_member_id is distinct from auth.uid() then
    raise exception 'Only the recipient can respond' using errcode='42501';
  end if;
  select * into v_occurrence from public.routine_occurrences
    where id=v_request.occurrence_id and household_id=p_household for update;
  if not found then raise exception 'Chore changed' using errcode='40001'; end if;
  perform 1 from public.routines where id=v_occurrence.routine_id and household_id=p_household
    and archived_at is null and paused_at is null for update nowait;
  if not found then raise exception 'Chore changed' using errcode='40001'; end if;
  select * into v_request from public.nest_chore_transfers where id=p_request and household_id=p_household for update;
  if v_request.state<>'pending' or v_occurrence.status<>'open' or v_occurrence.role is distinct from 'current'
    or v_request.expected_due_date<>v_occurrence.due_date
    or v_request.expected_assignment_revision<>v_occurrence.nest_assignment_revision
    or v_request.from_member_id is distinct from coalesce(v_occurrence.nest_accepted_assignee_id,v_occurrence.planned_assignee_id)
    or not exists(select 1 from public.household_members where household_id=p_household and user_id=v_request.from_member_id) then
    raise exception 'Transfer changed' using errcode='40001';
  end if;
  if p_action='accept' then
    update public.routine_occurrences set nest_accepted_assignee_id=v_request.to_member_id where id=v_occurrence.id;
  end if;
  update public.nest_chore_transfers set state=case when p_action='accept' then 'accepted' else 'declined' end,
    resolved_at=clock_timestamp() where id=p_request returning * into v_request;
  return v_request;
end;
$$;
revoke all on function private.nest_respond_chore_transfer(uuid,uuid,text) from public,anon,authenticated;

create function private.nest_validate_chore_transfer(p_action text,p_input jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare v_keys text[]; v_key text;
begin
  v_keys:=case p_action when 'request' then array['occurrenceId','expectedDueDate','recipientId']
    when 'accept' then array['requestId'] when 'decline' then array['requestId'] end;
  if v_keys is null or p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>4096 or not(p_input ?& v_keys) or p_input-v_keys<>'{}'::jsonb then
    raise exception 'Invalid transfer command' using errcode='22023';
  end if;
  foreach v_key in array v_keys loop
    if jsonb_typeof(p_input->v_key) is distinct from 'string' then
      raise exception 'Invalid transfer field' using errcode='22023';
    end if;
    if v_key='expectedDueDate' then
      if length(p_input->>v_key)<>10 or p_input->>v_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or extract(year from (p_input->>v_key)::date) not between 1 and 9999 then
        raise exception 'Invalid transfer date' using errcode='22023';
      end if;
    elsif length(p_input->>v_key)<>36 or p_input->>v_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid transfer identity' using errcode='22023';
    end if;
  end loop;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Invalid transfer date' using errcode='22023';
end;
$$;
revoke all on function private.nest_validate_chore_transfer(text,jsonb) from public,anon,authenticated;

create function private.nest_chore_transfer(p_household uuid,p_operation uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_prior public.nest_chore_transfer_receipts; v_hash bytea;
  v_request public.nest_chore_transfers; v_result jsonb; v_members integer;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  perform private.nest_validate_chore_transfer(p_action,p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:chore-transfer:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('action',p_action,'input',p_input)::text,'UTF8'));
  select * into v_prior from public.nest_chore_transfer_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Transfer operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Both members must be present' using errcode='42501'; end if;
  if p_action='request' then
    v_request:=private.nest_request_chore_transfer(p_household,(p_input->>'occurrenceId')::uuid,
      (p_input->>'expectedDueDate')::date,(p_input->>'recipientId')::uuid);
  else
    v_request:=private.nest_respond_chore_transfer(p_household,(p_input->>'requestId')::uuid,p_action);
  end if;
  v_result:=jsonb_build_object('actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'requestId',v_request.id,'occurrenceId',v_request.occurrence_id,'dueDate',v_request.expected_due_date,
    'fromMemberId',v_request.from_member_id,'toMemberId',v_request.to_member_id,'action',p_action,'state',v_request.state);
  insert into public.nest_chore_transfer_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when lock_not_available then
  raise exception 'Chore changed; read its current state' using errcode='40001';
end;
$$;
revoke all on function private.nest_chore_transfer(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.nest_chore_transfer(uuid,uuid,text,jsonb) to authenticated;
create function public.nest_chore_transfer(p_household uuid,p_operation uuid,p_action text,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_chore_transfer($1,$2,$3,$4);
$$;
revoke all on function public.nest_chore_transfer(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.nest_chore_transfer(uuid,uuid,text,jsonb) to authenticated;

create function private.nest_list_chore_transfers(p_household uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(row.value order by row.created_at,row.id),'[]'::jsonb) into v_result
  from (
    select t.id,t.created_at,jsonb_build_object('requestId',t.id,'occurrenceId',t.occurrence_id,
      'dueDate',t.expected_due_date,'fromMemberId',t.from_member_id,'toMemberId',t.to_member_id,
      'title',r.title) as value
    from public.nest_chore_transfers t
    join public.routine_occurrences o on o.id=t.occurrence_id and o.household_id=t.household_id
    join public.routines r on r.id=o.routine_id and r.household_id=o.household_id
    where t.household_id=p_household and t.state='pending' and o.role='current' and o.status='open'
      and r.paused_at is null and r.archived_at is null
      and t.expected_assignment_revision=o.nest_assignment_revision and t.expected_due_date=o.due_date
      and t.from_member_id=coalesce(o.nest_accepted_assignee_id,o.planned_assignee_id)
      and exists(select 1 from public.household_members m where m.household_id=p_household and m.user_id=t.to_member_id)
    order by t.created_at,t.id limit 201
  ) row;
  if jsonb_array_length(v_result)>200 then raise exception 'Too many transfers' using errcode='22023'; end if;
  return v_result;
end;
$$;
revoke all on function private.nest_list_chore_transfers(uuid) from public,anon,authenticated;
grant execute on function private.nest_list_chore_transfers(uuid) to authenticated;
create function public.nest_list_chore_transfers(p_household uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_list_chore_transfers($1);
$$;
revoke all on function public.nest_list_chore_transfers(uuid) from public,anon,authenticated;
grant execute on function public.nest_list_chore_transfers(uuid) to authenticated;
