-- GATED: explicit grocery expense metadata; checking groceries never invokes this writer.
create table public.nest_grocery_expenses (
  event_id uuid primary key references public.financial_events(id),
  household_id uuid not null references public.households(id),
  receipt_total_cents bigint not null check(receipt_total_cents between 0 and 9007199254740991)
);
alter table public.nest_grocery_expenses enable row level security;
revoke all on public.nest_grocery_expenses from public,anon,authenticated;
grant select on public.nest_grocery_expenses to authenticated;
create policy member_grocery_expenses on public.nest_grocery_expenses for select to authenticated
  using((select private.is_household_member(household_id)));
create trigger nest_grocery_expenses_are_append_only before update or delete on public.nest_grocery_expenses
  for each row execute function private.reject_financial_history_change();

create function private.nest_validate_grocery_total(p_payload jsonb)
returns void language plpgsql immutable set search_path='' as $$
begin
  if not p_payload ? 'receiptTotalCentimes' then return; end if;
  if jsonb_typeof(p_payload->'receiptTotalCentimes') is distinct from 'string'
    or p_payload->>'receiptTotalCentimes' !~ '^(0|[1-9][0-9]{0,15})$'
    or jsonb_typeof(p_payload->'amountCentimes') is distinct from 'string'
    or p_payload->>'amountCentimes' !~ '^(0|[1-9][0-9]{0,15})$' then
    raise exception 'Invalid grocery receipt total' using errcode='22023';
  end if;
  if (p_payload->>'receiptTotalCentimes')::numeric>9007199254740991
    or (p_payload->>'receiptTotalCentimes')::numeric<(p_payload->>'amountCentimes')::numeric then
    raise exception 'Shared amount exceeds receipt total' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.nest_validate_grocery_total(jsonb) from public,anon,authenticated;

create or replace function private.nest_expense_payload(p_payload jsonb,p_household uuid)
returns jsonb language plpgsql set search_path='' as $$
declare v_amount bigint; v_date date; v_item jsonb; v_allocations jsonb:='[]'; v_category uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>32768
    or not p_payload ?& array['description','amountCentimes','payerId','allocations','date','note','categoryId']
    or p_payload-array['description','amountCentimes','payerId','allocations','date','note','categoryId','receiptTotalCentimes']<>'{}'::jsonb then
    raise exception 'Invalid expense payload' using errcode='22023';
  end if;
  if jsonb_typeof(p_payload->'description') is distinct from 'string'
    or length(p_payload->>'description') not between 1 and 200 or btrim(p_payload->>'description',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')=''
    or jsonb_typeof(p_payload->'amountCentimes') is distinct from 'string'
    or (p_payload->>'amountCentimes') !~ '^(0|[1-9][0-9]{0,15})$'
    or jsonb_typeof(p_payload->'payerId') is distinct from 'string'
    or (p_payload->>'payerId')::uuid::text is distinct from p_payload->>'payerId'
    or jsonb_typeof(p_payload->'date') is distinct from 'string'
    or (p_payload->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or jsonb_typeof(p_payload->'note') not in ('null','string')
    or length(p_payload->>'note')>4000
    or jsonb_typeof(p_payload->'categoryId') not in ('null','string') then
    raise exception 'Invalid expense fields' using errcode='22023';
  end if;
  perform private.nest_validate_grocery_total(p_payload);
  v_amount:=(p_payload->>'amountCentimes')::bigint;
  if v_amount>9007199254740991 then raise exception 'Invalid centimes' using errcode='22023'; end if;
  v_date:=(p_payload->>'date')::date;
  if to_char(v_date,'YYYY-MM-DD')<>p_payload->>'date' or extract(year from v_date) not between 1 and 9999 then
    raise exception 'Invalid expense date' using errcode='22023';
  end if;
  if jsonb_typeof(p_payload->'allocations') is distinct from 'array' then
    raise exception 'Invalid expense allocations' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'allocations') loop
    if jsonb_typeof(v_item) is distinct from 'object' or not v_item ?& array['memberId','centimes']
      or v_item-array['memberId','centimes']<>'{}'::jsonb
      or jsonb_typeof(v_item->'memberId') is distinct from 'string'
      or (v_item->>'memberId')::uuid::text is distinct from v_item->>'memberId'
      or jsonb_typeof(v_item->'centimes') is distinct from 'string'
      or (v_item->>'centimes') !~ '^(0|[1-9][0-9]{0,15})$'
      or (v_item->>'centimes')::numeric>9007199254740991 then
      raise exception 'Invalid expense allocation' using errcode='22023';
    end if;
    v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('memberId',v_item->>'memberId','allocatedCents',(v_item->>'centimes')::bigint));
  end loop;
  perform private.validate_money_allocations(p_household,v_amount,v_allocations);
  if not exists(select 1 from public.household_members where household_id=p_household and user_id=(p_payload->>'payerId')::uuid) then
    raise exception 'Invalid expense payer' using errcode='22023';
  end if;
  v_category:=(p_payload->>'categoryId')::uuid;
  if v_category is not null then
    perform 1 from public.expense_categories where household_id=p_household and id=v_category and archived_at is null for share;
    if not found then raise exception 'Expense category unavailable' using errcode='40001'; end if;
  end if;
  return v_allocations;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
  raise exception 'Invalid expense fields' using errcode='22023';
end;
$$;
revoke all on function private.nest_expense_payload(jsonb,uuid) from public,anon,authenticated;

create or replace function private.nest_canonical_expense(p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_item jsonb; v_allocations jsonb:='[]'; v_result jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>32768
    or not p_input ?& array['description','amountCentimes','payerId','allocations','date','note','categoryId']
    or p_input-array['description','amountCentimes','payerId','allocations','date','note','categoryId','receiptTotalCentimes']<>'{}'::jsonb
    or jsonb_typeof(p_input->'payerId') is distinct from 'string'
    or jsonb_typeof(p_input->'categoryId') not in ('null','string')
    or jsonb_typeof(p_input->'allocations') is distinct from 'array' then
    raise exception 'Invalid expense input' using errcode='22023';
  end if;
  perform private.nest_validate_grocery_total(p_input);
  v_result:=p_input||jsonb_build_object('payerId',private.nest_expense_uuid(p_input->'payerId',false),'categoryId',private.nest_expense_uuid(p_input->'categoryId',true));
  if jsonb_array_length(p_input->'allocations')<>2 then raise exception 'Invalid expense allocations' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_input->'allocations') loop
    if jsonb_typeof(v_item) is distinct from 'object' or not v_item ?& array['memberId','centimes']
      or v_item-array['memberId','centimes']<>'{}'::jsonb or jsonb_typeof(v_item->'memberId') is distinct from 'string' then
      raise exception 'Invalid expense allocation' using errcode='22023';
    end if;
    v_allocations:=v_allocations||jsonb_build_array(v_item||jsonb_build_object('memberId',private.nest_expense_uuid(v_item->'memberId',false)));
  end loop;
  return v_result||jsonb_build_object('allocations',v_allocations);
exception when invalid_text_representation then
  raise exception 'Invalid expense identity' using errcode='22023';
end;
$$;
revoke all on function private.nest_canonical_expense(jsonb) from public,anon,authenticated;

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
  if p_payload ? 'receiptTotalCentimes' then
    insert into public.nest_grocery_expenses(event_id,household_id,receipt_total_cents)
      values(v_event,p_household,(p_payload->>'receiptTotalCentimes')::bigint);
  end if;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'eventId',v_event,'approvalId',p_approval,'expense',p_payload);
  insert into public.nest_expense_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_record_expense(uuid,uuid,jsonb,uuid) from public,anon,authenticated;

create or replace function private.nest_money_detail(p_household uuid,p_event uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e public.financial_events%rowtype; v_shares jsonb; v_category jsonb; v_reversal uuid;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into e from public.financial_events where household_id=p_household and id=p_event;
  if not found then raise exception 'Financial event unavailable' using errcode='P0002'; end if;
  if (select count(*) from public.household_members where household_id=p_household)<>2
    or (select count(*) from public.ledger_entries where household_id=p_household and financial_event_id=e.id)<>2
    or (select sum(receivable_delta_cents) from public.ledger_entries where household_id=p_household and financial_event_id=e.id)<>0 then
    raise exception 'Incomplete ledger projection' using errcode='22023';
  end if;
  if e.type='reversal' and (
    (select count(*) from public.ledger_entries where household_id=p_household and financial_event_id=e.related_event_id)<>2
    or exists(select 1 from public.ledger_entries r
      left join public.ledger_entries original on original.household_id=r.household_id
        and original.financial_event_id=e.related_event_id and original.member_id=r.member_id
      where r.household_id=p_household and r.financial_event_id=e.id
        and (original.id is null or r.receivable_delta_cents<>-original.receivable_delta_cents))
  ) then raise exception 'Invalid reversal projection' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('memberId',l.member_id,
    'deltaCentimes',l.receivable_delta_cents::text,'allocatedCentimes',a.allocated_cents::text) order by l.member_id)
    into v_shares from public.ledger_entries l left join public.financial_allocations a
      on a.household_id=l.household_id and a.financial_event_id=l.financial_event_id and a.member_id=l.member_id
    where l.household_id=p_household and l.financial_event_id=e.id;
  select jsonb_build_object('id',id,'name',name) into v_category from public.expense_categories
    where household_id=p_household and id=e.category_id;
  select id into v_reversal from public.financial_events
    where household_id=p_household and related_event_id=e.id and type='reversal';
  return jsonb_build_object('version',1,'householdId',p_household,'event',jsonb_build_object(
    'eventId',e.id,'kind',e.type,'occurredOn',e.occurred_on::text,
    'createdAt',case when isfinite(e.created_at) then
      to_char(e.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ||
        case when extract(year from e.created_at at time zone 'UTC')<0 then ' BC' else '' end
      else e.created_at::text end,
    'occurredOrder',case when isfinite(e.occurred_on) then (e.occurred_on-date '2000-01-01')::text else e.occurred_on::text end,
    'createdOrder',case when isfinite(e.created_at) then (extract(epoch from e.created_at)*1000000)::numeric(30,0)::text else e.created_at::text end,
    'description',e.description,'amountCentimes',e.amount_cents::text,'createdBy',e.created_by_member_id,
    'payerId',e.payer_member_id,'relatedEventId',e.related_event_id,'hasReceipt',e.receipt_path is not null
  ),'receiptTotalCentimes',(select g.receipt_total_cents::text from public.nest_grocery_expenses g where g.household_id=p_household and g.event_id=e.id),'note',e.note,'category',v_category,'reversedById',v_reversal,'shares',v_shares);
end;
$$;
