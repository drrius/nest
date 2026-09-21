-- GATED: additive native refund boundary over the audited September legacy engine.
-- Source merges never authorize production migration or financial writes.
create table public.nest_refund_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null, result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_refund_receipts enable row level security;
revoke all on public.nest_refund_receipts from public,anon,authenticated;
grant select on public.nest_refund_receipts to authenticated;
create policy own_refund_receipts on public.nest_refund_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));
create trigger nest_refund_receipts_are_append_only before update or delete on public.nest_refund_receipts
  for each row execute function private.reject_financial_history_change();

create function private.nest_refund_context(p_household uuid,p_source uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_source jsonb; v_remaining jsonb; v_total numeric; v_min numeric;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  v_source:=private.nest_money_detail(p_household,p_source);
  if v_source->'event'->>'kind' not in ('expense','replacement') then
    raise exception 'Refund requires an expense or replacement' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('memberId',a.member_id,'centimes',a.remaining::text) order by a.member_id),
    sum(a.remaining),min(a.remaining) into v_remaining,v_total,v_min
  from (
    select original.member_id,original.allocated_cents::numeric-coalesce((
      select sum(returned.allocated_cents::numeric) from public.financial_events refund
      join public.financial_allocations returned on returned.financial_event_id=refund.id and returned.household_id=refund.household_id
      where refund.household_id=p_household and refund.related_event_id=p_source and refund.type='refund'
        and returned.member_id=original.member_id
        and not exists(select 1 from public.financial_events reversal where reversal.household_id=p_household
          and reversal.related_event_id=refund.id and reversal.type='reversal')
    ),0) remaining from public.financial_allocations original
    where original.household_id=p_household and original.financial_event_id=p_source
  ) a;
  if jsonb_array_length(v_remaining) is distinct from 2 or v_min<0 or v_total>9007199254740991 then
    raise exception 'Invalid refundable projection' using errcode='22023'; end if;
  return jsonb_build_object('version',1,'householdId',p_household,'source',v_source,
    'remaining',v_remaining,'refundable',v_source->>'reversedById' is null and v_total>0);
end;
$$;
revoke all on function private.nest_refund_context(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_refund_context(uuid,uuid) to authenticated;
create function public.nest_refund_context(p_household uuid,p_source uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_refund_context($1,$2);
$$;
revoke all on function public.nest_refund_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_refund_context(uuid,uuid) to authenticated;

create function private.nest_refund_payload(p_payload jsonb,p_household uuid)
returns jsonb language plpgsql set search_path='' as $$
declare v_base jsonb; v_allocations jsonb; v_total numeric; v_item jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>32768
    or not p_payload ?& array['sourceEventId','description','amountCentimes','payerId','allocations','expectedRemaining','date','note']
    or p_payload-array['sourceEventId','description','amountCentimes','payerId','allocations','expectedRemaining','date','note']<>'{}'::jsonb then
    raise exception 'Invalid refund payload' using errcode='22023'; end if;
  if jsonb_typeof(p_payload->'sourceEventId') is distinct from 'string'
    or (p_payload->>'sourceEventId')::uuid::text is distinct from p_payload->>'sourceEventId' then
    raise exception 'Invalid refund source' using errcode='22023'; end if;
  v_base:=(p_payload-array['sourceEventId','expectedRemaining'])||jsonb_build_object('categoryId',null);
  v_allocations:=private.nest_expense_payload(v_base,p_household);
  if (p_payload->>'amountCentimes')::numeric<=0 then
    raise exception 'Refund must be positive' using errcode='22023'; end if;
  if jsonb_typeof(p_payload->'expectedRemaining') is distinct from 'array' then
    raise exception 'Invalid remaining shares' using errcode='22023'; end if;
  v_total:=0;
  for v_item in select value from jsonb_array_elements(p_payload->'expectedRemaining') loop
    if jsonb_typeof(v_item->'centimes') is distinct from 'string' or v_item->>'centimes' !~ '^(0|[1-9][0-9]{0,15})$' then
      raise exception 'Invalid remaining share' using errcode='22023'; end if;
    v_total:=v_total+(v_item->>'centimes')::numeric;
  end loop;
  perform private.nest_expense_payload(v_base||jsonb_build_object('amountCentimes',v_total::text,'allocations',p_payload->'expectedRemaining'),p_household);
  return v_allocations;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'Invalid refund fields' using errcode='22023';
end;
$$;
revoke all on function private.nest_refund_payload(jsonb,uuid) from public,anon,authenticated;

create function private.nest_record_refund(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_refund_receipts;
  v_allocations jsonb; v_result jsonb; v_event uuid; v_source uuid; v_context jsonb; v_members integer;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_payload is null or octet_length(p_payload::text)>32768 then
    raise exception 'Invalid refund command' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:refund:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('payload',p_payload,'approval',p_approval)::text,'UTF8'));
  select * into v_prior from public.nest_refund_receipts where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Refund operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Refund requires two members' using errcode='23514'; end if;
  v_allocations:=private.nest_refund_payload(p_payload,p_household);
  v_source:=(p_payload->>'sourceEventId')::uuid;
  -- Match the legacy refund/correction order: source row before household ledger.
  perform 1 from public.financial_events where household_id=p_household and id=v_source for update;
  if not found then raise exception 'Refund source unavailable' using errcode='P0002'; end if;
  perform private.lock_household_ledger(p_household);
  v_context:=private.nest_refund_context(p_household,v_source);
  if not (v_context->>'refundable')::boolean or not ((v_context->'remaining') @> (p_payload->'expectedRemaining'))
    or not ((p_payload->'expectedRemaining') @> (v_context->'remaining'))
    or v_context->'source'->'event'->>'payerId' is distinct from p_payload->>'payerId' then
    raise exception 'Refund source changed; review remaining shares' using errcode='40001'; end if;
  if p_approval is not null then
    perform private.nest_consume_action_approval(p_approval,p_household,p_operation,'expenses.refund',1,p_payload);
  end if;
  v_result:=public.post_refund(v_source,(p_payload->>'amountCentimes')::bigint,v_allocations,
    (p_payload->>'date')::date,'nest:'||gen_random_uuid()::text,p_payload->>'description',p_payload->>'note');
  v_event:=(v_result->>'financial_event_id')::uuid;
  if v_event is null then raise exception 'Refund result unavailable' using errcode='55000'; end if;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'eventId',v_event,'approvalId',p_approval,'refund',p_payload);
  insert into public.nest_refund_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_record_refund(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function private.nest_save_refund(p_household uuid,p_operation uuid,p_payload jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select private.nest_record_refund($1,$2,$3,null);
$$;
create function private.nest_execute_refund(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_approval is null then raise exception 'Refund approval required' using errcode='55000'; end if;
  return private.nest_record_refund(p_household,p_operation,p_payload,p_approval);
end;
$$;
revoke all on function private.nest_save_refund(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.nest_execute_refund(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.nest_save_refund(uuid,uuid,jsonb) to authenticated;
grant execute on function private.nest_execute_refund(uuid,uuid,jsonb,uuid) to authenticated;
create function public.nest_save_refund(p_household uuid,p_operation uuid,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_refund($1,$2,$3);
$$;
create function public.nest_execute_refund(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_execute_refund($1,$2,$3,$4);
$$;
revoke all on function public.nest_save_refund(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.nest_execute_refund(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nest_save_refund(uuid,uuid,jsonb) to authenticated;
grant execute on function public.nest_execute_refund(uuid,uuid,jsonb,uuid) to authenticated;
