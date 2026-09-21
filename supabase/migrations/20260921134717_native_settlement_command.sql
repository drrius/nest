-- GATED: additive exact-amount settlement wrapper; no production application authorized.
create table public.nest_settlement_receipts (
 actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
 request_hash bytea not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(actor_id,household_id,operation_id)
);
alter table public.nest_settlement_receipts enable row level security;
revoke all on public.nest_settlement_receipts from public,anon,authenticated;
grant select on public.nest_settlement_receipts to authenticated;
create policy own_settlement_receipts on public.nest_settlement_receipts for select to authenticated
 using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));
create trigger nest_settlement_receipts_are_append_only before update or delete on public.nest_settlement_receipts
 for each row execute function private.reject_financial_history_change();

create function private.nest_settlement_payload(p_payload jsonb)
returns void language plpgsql set search_path='' as $$
declare v_date date; v_id text;
begin
 if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
  or octet_length(p_payload::text)>32768
  or not p_payload ?& array['description','amountCentimes','expectedOutstandingCentimes','payerId','recipientId','mode','date','note']
  or p_payload-array['description','amountCentimes','expectedOutstandingCentimes','payerId','recipientId','mode','date','note']<>'{}'::jsonb then
  raise exception 'Invalid settlement payload' using errcode='22023'; end if;
 if jsonb_typeof(p_payload->'description') is distinct from 'string'
  or length(p_payload->>'description') not between 1 and 200
  or btrim(p_payload->>'description',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')=''
  or jsonb_typeof(p_payload->'amountCentimes') is distinct from 'string'
  or (p_payload->>'amountCentimes') !~ '^[1-9][0-9]{0,15}$'
  or jsonb_typeof(p_payload->'expectedOutstandingCentimes') is distinct from 'string'
  or (p_payload->>'expectedOutstandingCentimes') !~ '^[1-9][0-9]{0,15}$'
  or jsonb_typeof(p_payload->'mode') is distinct from 'string'
  or (p_payload->>'mode') not in ('full','partial')
  or jsonb_typeof(p_payload->'date') is distinct from 'string'
  or (p_payload->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or jsonb_typeof(p_payload->'note') not in ('null','string') or length(p_payload->>'note')>4000 then
  raise exception 'Invalid settlement fields' using errcode='22023'; end if;
 foreach v_id in array array['payerId','recipientId'] loop
  if jsonb_typeof(p_payload->v_id) is distinct from 'string'
   or (p_payload->>v_id) !~ '^(00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$' then
   raise exception 'Invalid settlement member' using errcode='22023'; end if;
 end loop;
 if p_payload->>'payerId'=p_payload->>'recipientId'
  or (p_payload->>'expectedOutstandingCentimes')::bigint>9007199254740991
  or (p_payload->>'amountCentimes')::bigint>(p_payload->>'expectedOutstandingCentimes')::bigint
  or (p_payload->>'mode'='full' and p_payload->>'amountCentimes'<>p_payload->>'expectedOutstandingCentimes') then
  raise exception 'Invalid settlement amounts' using errcode='22023'; end if;
 v_date:=(p_payload->>'date')::date;
 if to_char(v_date,'YYYY-MM-DD')<>p_payload->>'date' or extract(year from v_date) not between 1 and 9999 then
  raise exception 'Invalid settlement date' using errcode='22023'; end if;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
 raise exception 'Invalid settlement fields' using errcode='22023';
end;
$$;
revoke all on function private.nest_settlement_payload(jsonb) from public,anon,authenticated;

create function private.nest_validate_settlement_balance(p_household uuid,p_payload jsonb)
returns void language plpgsql set search_path='' as $$
declare v_payer numeric; v_recipient numeric;
begin
 perform private.nest_settlement_payload(p_payload);
 if not exists(select 1 from public.household_members where household_id=p_household and user_id=(p_payload->>'payerId')::uuid)
  or not exists(select 1 from public.household_members where household_id=p_household and user_id=(p_payload->>'recipientId')::uuid) then
  raise exception 'Invalid settlement members' using errcode='22023'; end if;
 select coalesce(sum(receivable_delta_cents),0) into v_payer from public.ledger_entries
  where household_id=p_household and member_id=(p_payload->>'payerId')::uuid;
 select coalesce(sum(receivable_delta_cents),0) into v_recipient from public.ledger_entries
  where household_id=p_household and member_id=(p_payload->>'recipientId')::uuid;
 if v_payer<>-(p_payload->>'expectedOutstandingCentimes')::bigint or v_recipient<>-v_payer then
  raise exception 'Settlement balance changed; review again' using errcode='40001'; end if;
end;
$$;
revoke all on function private.nest_validate_settlement_balance(uuid,jsonb) from public,anon,authenticated;

create function private.nest_record_settlement(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_settlement_receipts; v_members integer; v_result jsonb; v_event uuid;
begin
 if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
 perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
 if not found then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_operation is null or p_payload is null or octet_length(p_payload::text)>32768 then
  raise exception 'Invalid settlement command' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nest:settlement:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
 v_hash:=sha256(convert_to(jsonb_build_object('payload',p_payload,'approval',p_approval)::text,'UTF8'));
 select * into v_prior from public.nest_settlement_receipts where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
 if found then
  if v_prior.request_hash<>v_hash then raise exception 'Settlement operation changed' using errcode='22023'; end if;
  return v_prior.result;
 end if;
 perform 1 from public.household_members where household_id=p_household order by user_id for key share;
 get diagnostics v_members=row_count;
 if v_members<>2 then raise exception 'Settlement requires two members' using errcode='23514'; end if;
 perform private.lock_household_ledger(p_household);
 perform private.nest_validate_settlement_balance(p_household,p_payload);
 if p_approval is not null then
  perform private.nest_consume_action_approval(p_approval,p_household,p_operation,'settlements.record',1,p_payload);
 end if;
 -- Both UI modes post exactly what was reviewed, never legacy full-mode recalculation.
 v_result:=public.record_settlement(p_household,(p_payload->>'payerId')::uuid,(p_payload->>'amountCentimes')::bigint,
  (p_payload->>'date')::date,p_payload->>'description','nest:'||gen_random_uuid()::text,p_payload->>'note','partial');
 v_event:=(v_result->>'financial_event_id')::uuid;
 if v_event is null then raise exception 'Settlement result unavailable' using errcode='55000'; end if;
 v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
  'eventId',v_event,'approvalId',p_approval,'settlement',p_payload);
 insert into public.nest_settlement_receipts(actor_id,household_id,operation_id,request_hash,result)
  values(v_actor,p_household,p_operation,v_hash,v_result);
 return v_result;
end;
$$;
revoke all on function private.nest_record_settlement(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function public.nest_save_settlement(p_household uuid,p_operation uuid,p_payload jsonb)
returns jsonb language sql security definer set search_path='' as $$ select private.nest_record_settlement($1,$2,$3,null); $$;
create function public.nest_execute_settlement(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_approval is null then raise exception 'Settlement approval required' using errcode='22023'; end if;
 return private.nest_record_settlement(p_household,p_operation,p_payload,p_approval);
end;
$$;
revoke all on function public.nest_save_settlement(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.nest_execute_settlement(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nest_save_settlement(uuid,uuid,jsonb) to authenticated;
grant execute on function public.nest_execute_settlement(uuid,uuid,jsonb,uuid) to authenticated;
