-- GATED: receipt reference is bound to the exact expense; upload alone never posts money.
create function private.nest_receipt_path(p_payload jsonb)
returns text language plpgsql immutable set search_path='' as $$
declare v_path text;
begin
  if not p_payload ? 'receiptPath' then return null; end if;
  v_path:=p_payload->>'receiptPath';
  if jsonb_typeof(p_payload->'receiptPath') is distinct from 'string'
    or v_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/receipts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$' then
    raise exception 'Invalid receipt path' using errcode='22023'; end if;
  return v_path;
end;
$$;
revoke all on function private.nest_receipt_path(jsonb) from public,anon,authenticated;

create function private.nest_validate_expense_receipt(p_payload jsonb,p_household uuid)
returns void language plpgsql stable security invoker set search_path='' as $$
declare v_path text:=private.nest_receipt_path(p_payload);
begin
  if v_path is null then return; end if;
  if split_part(v_path,'/',1)<>p_household::text or not exists(
    select 1 from public.household_attachment_uploads u join storage.objects o
      on o.bucket_id='household-files' and o.name=u.path
    where u.path=v_path and u.household_id=p_household and u.state in ('pending','claimed')
      and u.content_type=o.metadata->>'mimetype') then
    raise exception 'Receipt unavailable; choose an uploaded household receipt' using errcode='40001'; end if;
end;
$$;
revoke all on function private.nest_validate_expense_receipt(jsonb,uuid) from public,anon,authenticated;

create or replace function private.nest_expense_payload(p_payload jsonb,p_household uuid)
returns jsonb language plpgsql set search_path='' as $$
declare v_amount bigint; v_date date; v_item jsonb; v_allocations jsonb:='[]'; v_category uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>32768
    or not p_payload ?& array['description','amountCentimes','payerId','allocations','date','note','categoryId']
    or p_payload-array['description','amountCentimes','payerId','allocations','date','note','categoryId','receiptTotalCentimes','receiptPath']<>'{}'::jsonb then
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
  perform private.nest_validate_expense_receipt(p_payload,p_household);
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
    or p_input-array['description','amountCentimes','payerId','allocations','date','note','categoryId','receiptTotalCentimes','receiptPath']<>'{}'::jsonb
    or jsonb_typeof(p_input->'payerId') is distinct from 'string'
    or jsonb_typeof(p_input->'categoryId') not in ('null','string')
    or jsonb_typeof(p_input->'allocations') is distinct from 'array' then
    raise exception 'Invalid expense input' using errcode='22023';
  end if;
  perform private.nest_validate_grocery_total(p_input);
  perform private.nest_receipt_path(p_input);
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
    (p_payload->>'categoryId')::uuid,p_payload->>'note',private.nest_receipt_path(p_payload));
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

create or replace function private.nest_correction_replacement(p_household uuid,p_source uuid,p_input jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare v_source public.financial_events; v_input jsonb; v_expense jsonb; v_allocations jsonb; v_members jsonb;
begin
  if p_input='null'::jsonb then return null; end if;
  select * into v_source from public.financial_events where household_id=p_household and id=p_source;
  if p_input->>'kind'='expense' and v_source.type in ('expense','replacement') then
    if not p_input ?& array['kind','expense'] or p_input-array['kind','expense']<>'{}'::jsonb then
      raise exception 'Invalid replacement expense' using errcode='22023'; end if;
    v_input:=p_input->'expense';
    if v_input ? 'receiptPath' then raise exception 'Correction retains original receipt' using errcode='22023'; end if;
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
