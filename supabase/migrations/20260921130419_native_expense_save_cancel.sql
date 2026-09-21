-- GATED: cancelling an unresolved direct Save never changes retained financial history.
create table public.nest_expense_save_cancellations (
  actor_id uuid not null,
  household_id uuid not null,
  operation_id uuid not null,
  cancelled_at timestamptz not null default now(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_expense_save_cancellations enable row level security;
revoke all on public.nest_expense_save_cancellations from public,anon,authenticated;
grant select on public.nest_expense_save_cancellations to authenticated;
create policy own_expense_save_cancellations on public.nest_expense_save_cancellations for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));
create trigger nest_expense_save_cancellations_are_append_only
before update or delete on public.nest_expense_save_cancellations
for each row execute function private.reject_financial_history_change();

create function private.nest_read_expense_save(p_household uuid,p_operation uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_receipt jsonb; v_status text;
begin
  if v_actor is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  select result into v_receipt from public.nest_expense_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if v_receipt is not null and v_receipt->>'approvalId' is not null then
    raise exception 'Not a direct Save operation' using errcode='22023'; end if;
  v_status:=case when v_receipt is not null then 'recorded'
    when exists(select 1 from public.nest_expense_save_cancellations
      where actor_id=v_actor and household_id=p_household and operation_id=p_operation) then 'cancelled'
    else 'unresolved' end;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'status',v_status,'receipt',v_receipt);
end;
$$;
create function private.nest_cancel_expense_save(p_household uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_receipt jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:expense:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  select result into v_receipt from public.nest_expense_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if v_receipt is not null and v_receipt->>'approvalId' is not null then
    raise exception 'Not a direct Save operation' using errcode='22023'; end if;
  if v_receipt is null then
    insert into public.nest_expense_save_cancellations(actor_id,household_id,operation_id)
      values(v_actor,p_household,p_operation) on conflict do nothing;
  end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'status',case when v_receipt is null then 'cancelled' else 'recorded' end,
    'receipt',v_receipt);
end;
$$;

create or replace function private.nest_record_expense(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_expense_receipts;
  v_allocations jsonb; v_result jsonb; v_event uuid; v_members integer;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_payload is null or octet_length(p_payload::text)>32768 then
    raise exception 'Invalid expense command' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:expense:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('payload',p_payload,'approval',p_approval)::text,'UTF8'));
  select * into v_prior from public.nest_expense_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Expense operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  if p_approval is null and exists(select 1 from public.nest_expense_save_cancellations
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation) then
    raise exception 'Expense Save cancelled' using errcode='40001'; end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Expense requires two members' using errcode='23514'; end if;
  -- Consistent lock order: ledger, selected category, approval. Category archive
  -- cannot invalidate a checked selection while the expense waits or commits.
  perform private.lock_household_ledger(p_household);
  v_allocations:=private.nest_expense_payload(p_payload,p_household);
  if p_approval is not null then
    perform private.nest_consume_action_approval(p_approval,p_household,p_operation,'expenses.record',1,p_payload);
  end if;
  v_result:=public.post_manual_expense(p_household,p_payload->>'description',(p_payload->>'amountCentimes')::bigint,
    (p_payload->>'payerId')::uuid,v_allocations,(p_payload->>'date')::date,'nest:'||gen_random_uuid()::text,
    (p_payload->>'categoryId')::uuid,p_payload->>'note',null);
  v_event:=(v_result->>'financial_event_id')::uuid;
  if v_event is null then raise exception 'Expense result unavailable' using errcode='55000'; end if;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'eventId',v_event,'approvalId',p_approval,'expense',p_payload);
  insert into public.nest_expense_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_record_expense(uuid,uuid,jsonb,uuid) from public,anon,authenticated;


revoke all on function private.nest_read_expense_save(uuid,uuid) from public,anon,authenticated;
revoke all on function private.nest_cancel_expense_save(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_read_expense_save(uuid,uuid) to authenticated;
grant execute on function private.nest_cancel_expense_save(uuid,uuid) to authenticated;
create function public.nest_read_expense_save(p_household uuid,p_operation uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_read_expense_save($1,$2);
$$;
create function public.nest_cancel_expense_save(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_cancel_expense_save($1,$2);
$$;
revoke all on function public.nest_read_expense_save(uuid,uuid) from public,anon,authenticated;
revoke all on function public.nest_cancel_expense_save(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_read_expense_save(uuid,uuid) to authenticated;
grant execute on function public.nest_cancel_expense_save(uuid,uuid) to authenticated;
