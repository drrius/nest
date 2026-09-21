-- GATED: cancelling an unresolved direct Save never changes retained financial history.
create table public.nest_refund_save_cancellations (
  actor_id uuid not null,
  household_id uuid not null,
  operation_id uuid not null,
  cancelled_at timestamptz not null default now(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_refund_save_cancellations enable row level security;
revoke all on public.nest_refund_save_cancellations from public,anon,authenticated;
grant select on public.nest_refund_save_cancellations to authenticated;
create policy own_refund_save_cancellations on public.nest_refund_save_cancellations for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));
create trigger nest_refund_save_cancellations_are_append_only
before update or delete on public.nest_refund_save_cancellations
for each row execute function private.reject_financial_history_change();

create function private.nest_read_refund_save(p_household uuid,p_operation uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_receipt jsonb; v_status text;
begin
  if v_actor is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  select result into v_receipt from public.nest_refund_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if v_receipt is not null and v_receipt->>'approvalId' is not null then
    raise exception 'Not a direct Save operation' using errcode='22023'; end if;
  v_status:=case when v_receipt is not null then 'recorded'
    when exists(select 1 from public.nest_refund_save_cancellations
      where actor_id=v_actor and household_id=p_household and operation_id=p_operation) then 'cancelled'
    else 'unresolved' end;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'status',v_status,'receipt',v_receipt);
end;
$$;
create function private.nest_cancel_refund_save(p_household uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_receipt jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:refund:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  select result into v_receipt from public.nest_refund_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if v_receipt is not null and v_receipt->>'approvalId' is not null then
    raise exception 'Not a direct Save operation' using errcode='22023'; end if;
  if v_receipt is null then
    insert into public.nest_refund_save_cancellations(actor_id,household_id,operation_id)
      values(v_actor,p_household,p_operation) on conflict do nothing;
  end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'status',case when v_receipt is null then 'cancelled' else 'recorded' end,
    'receipt',v_receipt);
end;
$$;

create or replace function private.nest_record_refund(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
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
  if p_approval is null and exists(select 1 from public.nest_refund_save_cancellations
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation) then
    raise exception 'Refund Save cancelled' using errcode='40001'; end if;
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


revoke all on function private.nest_read_refund_save(uuid,uuid) from public,anon,authenticated;
revoke all on function private.nest_cancel_refund_save(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_read_refund_save(uuid,uuid) to authenticated;
grant execute on function private.nest_cancel_refund_save(uuid,uuid) to authenticated;
create function public.nest_read_refund_save(p_household uuid,p_operation uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_read_refund_save($1,$2);
$$;
create function public.nest_cancel_refund_save(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_cancel_refund_save($1,$2);
$$;
revoke all on function public.nest_read_refund_save(uuid,uuid) from public,anon,authenticated;
revoke all on function public.nest_cancel_refund_save(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_read_refund_save(uuid,uuid) to authenticated;
grant execute on function public.nest_cancel_refund_save(uuid,uuid) to authenticated;
