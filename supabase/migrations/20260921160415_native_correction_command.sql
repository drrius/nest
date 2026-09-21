-- GATED: source integration does not authorize production migration.
-- Preserve the audited correction engine and its parent-before-target-before-ledger locks.
create table public.nest_correction_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null, result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_correction_receipts enable row level security;
revoke all on public.nest_correction_receipts from public,anon,authenticated;
grant select on public.nest_correction_receipts to authenticated;
create policy own_correction_receipts on public.nest_correction_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));
create trigger nest_correction_receipts_are_append_only before update or delete on public.nest_correction_receipts
  for each row execute function private.reject_financial_history_change();

create function private.nest_correction_identity(p_payload jsonb)
returns uuid language plpgsql immutable set search_path='' as $$
begin
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>32768
    or not p_payload ?& array['sourceEventId','expectedReversalId','replacement']
    or p_payload-array['sourceEventId','expectedReversalId','replacement']<>'{}'::jsonb
    or jsonb_typeof(p_payload->'sourceEventId') is distinct from 'string'
    or (p_payload->>'sourceEventId')::uuid::text is distinct from p_payload->>'sourceEventId'
    or jsonb_typeof(p_payload->'expectedReversalId') not in ('string','null')
    or (p_payload->>'expectedReversalId')::uuid::text is distinct from p_payload->>'expectedReversalId'
    or jsonb_typeof(p_payload->'replacement') not in ('object','null') then
    raise exception 'Invalid correction payload' using errcode='22023'; end if;
  return (p_payload->>'sourceEventId')::uuid;
exception when invalid_text_representation then
  raise exception 'Invalid correction identity' using errcode='22023';
end;
$$;
revoke all on function private.nest_correction_identity(jsonb) from public,anon,authenticated;

create function private.nest_correction_replacement(p_household uuid,p_source uuid,p_input jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare v_source public.financial_events; v_input jsonb; v_expense jsonb; v_allocations jsonb; v_members jsonb;
begin
  if p_input='null'::jsonb then return null; end if;
  select * into v_source from public.financial_events where household_id=p_household and id=p_source;
  if p_input->>'kind'='expense' and v_source.type in ('expense','replacement') then
    if not p_input ?& array['kind','expense'] or p_input-array['kind','expense']<>'{}'::jsonb then
      raise exception 'Invalid replacement expense' using errcode='22023'; end if;
    v_input:=p_input->'expense';
    v_allocations:=private.nest_expense_payload(v_input,p_household);
    if exists(select 1 from public.nest_grocery_expenses where household_id=p_household and event_id=p_source)
      and not v_input ? 'receiptTotalCentimes' then
      raise exception 'Review the grocery receipt total for the replacement' using errcode='22023'; end if;
  elsif p_input->>'kind'='opening_balance' and v_source.type='opening_balance' then
    if not p_input ?& array['kind','opening'] or p_input-array['kind','opening']<>'{}'::jsonb then
      raise exception 'Invalid replacement opening' using errcode='22023'; end if;
    v_input:=p_input->'opening';
    if jsonb_typeof(v_input) is distinct from 'object'
      or not v_input ?& array['description','amountCentimes','payerId','date','note']
      or v_input-array['description','amountCentimes','payerId','date','note']<>'{}'::jsonb then
      raise exception 'Invalid replacement opening' using errcode='22023'; end if;
    -- Reuse strict text/date/centime/member validation without inventing expense allocations for an opening.
    select jsonb_agg(jsonb_build_object('memberId',user_id,'centimes',
      case when user_id::text=v_input->>'payerId' then v_input->>'amountCentimes' else '0' end) order by user_id)
      into v_members from public.household_members where household_id=p_household;
    v_expense:=v_input||jsonb_build_object('categoryId',null,'allocations',v_members);
    perform private.nest_expense_payload(v_expense,p_household);
    v_allocations:=null;
  else raise exception 'Replacement kind does not match the original entry' using errcode='22023'; end if;
  return jsonb_build_object('description',v_input->>'description','amount_cents',(v_input->>'amountCentimes')::bigint,
    'payer_member_id',v_input->>'payerId','allocations',v_allocations,'occurred_on',v_input->>'date',
    'category_id',v_input->>'categoryId','note',v_input->>'note','receipt_path',v_source.receipt_path);
end;
$$;
revoke all on function private.nest_correction_replacement(uuid,uuid,jsonb) from public,anon,authenticated;

create function private.nest_record_correction(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_correction_receipts;
  v_source public.financial_events; v_source_id uuid; v_reversal uuid; v_replacement jsonb;
  v_result jsonb; v_members integer; v_replacement_id uuid;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_payload is null or octet_length(p_payload::text)>32768 then
    raise exception 'Invalid correction command' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:correction:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('payload',p_payload,'approval',p_approval)::text,'UTF8'));
  select * into v_prior from public.nest_correction_receipts where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Correction operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Correction requires two members' using errcode='23514'; end if;
  v_source_id:=private.nest_correction_identity(p_payload);
  select * into v_source from public.financial_events where household_id=p_household and id=v_source_id;
  if not found then raise exception 'Correction source unavailable' using errcode='P0002'; end if;
  if v_source.type='refund' then
    perform 1 from public.financial_events where household_id=p_household and id=v_source.related_event_id for update;
  end if;
  perform 1 from public.financial_events where household_id=p_household and id=v_source_id for update;
  perform private.lock_household_ledger(p_household);
  select id into v_reversal from public.financial_events where household_id=p_household and related_event_id=v_source_id and type='reversal';
  if v_reversal::text is distinct from p_payload->>'expectedReversalId' then
    raise exception 'Correction source changed; review the retained entry' using errcode='40001'; end if;
  v_replacement:=private.nest_correction_replacement(p_household,v_source_id,p_payload->'replacement');
  if p_approval is not null then
    perform private.nest_consume_action_approval(p_approval,p_household,p_operation,'expenses.correct',1,p_payload);
  end if;
  v_result:=public.correct_financial_event(v_source_id,'nest:'||gen_random_uuid()::text,v_replacement);
  v_reversal:=(v_result->>'reversal_event_id')::uuid;
  v_replacement_id:=(v_result->>'replacement_event_id')::uuid;
  if v_reversal is null or (v_replacement_id is null)<>(v_replacement is null) then
    raise exception 'Correction result unavailable' using errcode='55000'; end if;
  if v_replacement_id is not null and p_payload->'replacement'->>'kind'='expense'
    and p_payload->'replacement'->'expense' ? 'receiptTotalCentimes' then
    insert into public.nest_grocery_expenses(event_id,household_id,receipt_total_cents)
      values(v_replacement_id,p_household,(p_payload->'replacement'->'expense'->>'receiptTotalCentimes')::bigint);
  end if;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'approvalId',p_approval,'correction',p_payload,'reversalEventId',v_reversal,'replacementEventId',v_replacement_id);
  insert into public.nest_correction_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_record_correction(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function private.nest_save_correction(p_household uuid,p_operation uuid,p_payload jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select private.nest_record_correction($1,$2,$3,null);
$$;
create function private.nest_execute_correction(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_approval is null then raise exception 'Correction approval required' using errcode='55000'; end if;
  return private.nest_record_correction($1,$2,$3,$4);
end;
$$;
revoke all on function private.nest_save_correction(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.nest_execute_correction(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.nest_save_correction(uuid,uuid,jsonb) to authenticated;
grant execute on function private.nest_execute_correction(uuid,uuid,jsonb,uuid) to authenticated;
create function public.nest_save_correction(p_household uuid,p_operation uuid,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_correction($1,$2,$3);
$$;
create function public.nest_execute_correction(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_execute_correction($1,$2,$3,$4);
$$;
revoke all on function public.nest_save_correction(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.nest_execute_correction(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nest_save_correction(uuid,uuid,jsonb) to authenticated;
grant execute on function public.nest_execute_correction(uuid,uuid,jsonb,uuid) to authenticated;
