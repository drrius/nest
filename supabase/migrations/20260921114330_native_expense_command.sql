-- GATED: additive to the audited legacy expense engine and Nest approvals.
-- No production application is authorized by a source merge.
create table public.nest_expense_receipts (
  actor_id uuid not null,
  household_id uuid not null,
  operation_id uuid not null,
  request_hash bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_expense_receipts enable row level security;
revoke all on public.nest_expense_receipts from public,anon,authenticated;
grant select on public.nest_expense_receipts to authenticated;
create policy own_expense_receipts on public.nest_expense_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));
create trigger nest_expense_receipts_are_append_only
before update or delete on public.nest_expense_receipts
for each row execute function private.reject_financial_history_change();

create function private.nest_expense_payload(p_payload jsonb,p_household uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_amount bigint; v_date date; v_item jsonb; v_allocations jsonb:='[]'; v_category uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>16384
    or not p_payload ?& array['description','amountCentimes','payerId','allocations','date','note','categoryId']
    or p_payload-array['description','amountCentimes','payerId','allocations','date','note','categoryId']<>'{}'::jsonb then
    raise exception 'Invalid expense payload' using errcode='22023';
  end if;
  if jsonb_typeof(p_payload->'description') is distinct from 'string'
    or length(p_payload->>'description') not between 1 and 200 or btrim(p_payload->>'description')=''
    or jsonb_typeof(p_payload->'amountCentimes') is distinct from 'string'
    or (p_payload->>'amountCentimes') !~ '^(0|[1-9][0-9]{0,15})$'
    or jsonb_typeof(p_payload->'payerId') is distinct from 'string'
    or (p_payload->>'payerId')::uuid::text is distinct from p_payload->>'payerId'
    or jsonb_typeof(p_payload->'date') is distinct from 'string'
    or (p_payload->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or jsonb_typeof(p_payload->'note') not in ('null','string')
    or length(p_payload->>'note')>8000
    or jsonb_typeof(p_payload->'categoryId') not in ('null','string') then
    raise exception 'Invalid expense fields' using errcode='22023';
  end if;
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
  if v_category is not null and not exists(select 1 from public.expense_categories where household_id=p_household and id=v_category and archived_at is null) then
    raise exception 'Expense category unavailable' using errcode='40001';
  end if;
  return v_allocations;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
  raise exception 'Invalid expense fields' using errcode='22023';
end;
$$;
revoke all on function private.nest_expense_payload(jsonb,uuid) from public,anon,authenticated;

create function private.nest_record_expense(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_expense_receipts;
  v_allocations jsonb; v_result jsonb; v_event uuid; v_members integer;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_payload is null or octet_length(p_payload::text)>16384 then
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
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Expense requires two members' using errcode='23514'; end if;
  v_allocations:=private.nest_expense_payload(p_payload,p_household);
  -- Wait before checking expiry. No delayed ledger lock can outlive approval validity.
  perform private.lock_household_ledger(p_household);
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

-- Native Save is the member's direct authorization. AI never receives this tool.
create function private.nest_save_expense(p_household uuid,p_operation uuid,p_payload jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select private.nest_record_expense($1,$2,$3,null);
$$;
-- AI execution always requires the exact server approval. Its invocation is the operation.
create function private.nest_execute_expense(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_approval is null then raise exception 'Expense approval required' using errcode='55000'; end if;
  return private.nest_record_expense(p_household,p_operation,p_payload,p_approval);
end;
$$;
revoke all on function private.nest_save_expense(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.nest_execute_expense(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.nest_save_expense(uuid,uuid,jsonb) to authenticated;
grant execute on function private.nest_execute_expense(uuid,uuid,jsonb,uuid) to authenticated;
create function public.nest_save_expense(p_household uuid,p_operation uuid,p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_expense($1,$2,$3);
$$;
create function public.nest_execute_expense(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_execute_expense($1,$2,$3,$4);
$$;
revoke all on function public.nest_save_expense(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.nest_execute_expense(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nest_save_expense(uuid,uuid,jsonb) to authenticated;
grant execute on function public.nest_execute_expense(uuid,uuid,jsonb,uuid) to authenticated;
