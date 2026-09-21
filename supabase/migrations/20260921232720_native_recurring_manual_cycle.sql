-- GATED: explicit existing-expense linkage consumes a cycle without posting any money.
alter table public.nest_action_approvals drop constraint nest_action_approvals_command_check;
alter table public.nest_action_approvals add constraint nest_action_approvals_command_check
  check(command in ('expenses.record','expenses.correct','expenses.refund','settlements.record',
    'groceryExpenses.record','recurring.create','recurring.update','recurring.pause','recurring.cancel','recurring.resume','recurring.record-cycle','recurring.link-cycle','memory.save'));
create function private.nest_manual_cycle_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_due date;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>32768
    or not p_input ?& array['ruleId','expectedRevision','dueOn','sourceEventId']
    or p_input-array['ruleId','expectedRevision','dueOn','sourceEventId']<>'{}'::jsonb then
    raise exception 'Invalid manual cycle' using errcode='22023'; end if;
  if jsonb_typeof(p_input->'ruleId') is distinct from 'string'
    or jsonb_typeof(p_input->'expectedRevision') is distinct from 'string'
    or (p_input->>'ruleId')::uuid::text is distinct from p_input->>'ruleId'
    or (p_input->>'expectedRevision')::uuid::text is distinct from p_input->>'expectedRevision'
    or jsonb_typeof(p_input->'dueOn') is distinct from 'string'
    or (p_input->>'dueOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid manual cycle identity' using errcode='22023'; end if;
  if jsonb_typeof(p_input->'sourceEventId') is distinct from 'string'
    or (p_input->>'sourceEventId')::uuid::text is distinct from p_input->>'sourceEventId' then
    raise exception 'Invalid manual source identity' using errcode='22023'; end if;
  v_due:=(p_input->>'dueOn')::date;
  if not isfinite(v_due) or to_char(v_due,'YYYY-MM-DD')<>p_input->>'dueOn'
    or v_due<date '0001-01-01' or v_due>date '9999-12-31' then
    raise exception 'Invalid manual cycle date' using errcode='22023'; end if;
end;
$$;
revoke all on function private.nest_manual_cycle_input(jsonb) from public,anon,authenticated;
create function private.nest_link_manual_cycle(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_recurring_cycle_receipts;
  v_rule public.nest_recurring_rules; v_cursor private.nest_recurring_execution;
  v_id uuid; v_due date; v_members integer; v_cycle jsonb; v_next jsonb;
  v_source jsonb; v_event uuid; v_result jsonb;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid cycle operation' using errcode='22023'; end if;
  perform private.nest_manual_cycle_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-cycle-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('input',p_input,'approval',p_approval)::text,'UTF8'));
  select * into v_prior from public.nest_recurring_cycle_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Cycle operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Manual cycle requires two members' using errcode='42501'; end if;
  v_id:=(p_input->>'ruleId')::uuid; v_due:=(p_input->>'dueOn')::date;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-rule:'||p_household::text||':'||v_id::text,0));
  select * into v_rule from public.nest_recurring_rules where household_id=p_household and id=v_id for update;
  if not found or v_rule.revision<>(p_input->>'expectedRevision')::uuid or v_rule.status<>'active' then
    raise exception 'Recurring rule changed' using errcode='40001'; end if;
  select * into v_cursor from private.nest_recurring_execution where household_id=p_household and rule_id=v_id for update;
  if not found then raise exception 'Recurring execution unavailable' using errcode='55000'; end if;
  if v_cursor.next_due_on is distinct from v_due or v_due>(clock_timestamp() at time zone 'Europe/Zurich')::date
    or v_due<(v_rule.configuration->>'startDate')::date then
    raise exception 'Recurring cycle is not due' using errcode='40001'; end if;
  v_cycle:=private.nest_recurring_cycle(v_rule.configuration->'schedule',v_due,v_cursor.covered_through);
  if v_cycle is null or v_cycle->>'dueOn' is distinct from p_input->>'dueOn'
    or exists(select 1 from public.nest_recurring_cycles where household_id=p_household and rule_id=v_id and cycle_key=v_cycle->>'key') then
    raise exception 'Cycle already covered' using errcode='40001'; end if;
  v_event:=(p_input->>'sourceEventId')::uuid;
  perform 1 from public.financial_events where household_id=p_household and id=v_event for update;
  if not found then raise exception 'Manual expense unavailable' using errcode='42501'; end if;
  -- Existing correction/refund commands lock the source before the ledger.
  perform private.lock_household_ledger(p_household);
  v_source:=private.nest_money_detail(p_household,v_event);
  if v_source->'event'->>'kind' not in ('expense','replacement') or v_source->>'reversedById' is not null
    or (v_source->'event'->>'occurredOn')::date<(v_cycle->>'startsOn')::date
    or (v_source->'event'->>'occurredOn')::date>(v_cycle->>'through')::date
    or exists(select 1 from public.nest_recurring_cycles where event_id=v_event) then
    raise exception 'Manual expense is not eligible for this cycle' using errcode='40001'; end if;
  if p_approval is not null then
    perform private.nest_consume_action_approval(p_approval,p_household,p_operation,'recurring.link-cycle',1,p_input);
  end if;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'approvalId',p_approval,'source','manual','eventId',v_event,'input',p_input,'cycle',v_cycle,
    'configuration',v_rule.configuration,'linkedExpense',v_source);
  insert into public.nest_recurring_cycles(household_id,rule_id,cycle_key,due_on,starts_on,through_date,revision,event_id,result)
    values(p_household,v_id,v_cycle->>'key',v_due,(v_cycle->>'startsOn')::date,(v_cycle->>'through')::date,v_rule.revision,v_event,v_result);
  v_next:=private.nest_recurring_cycle(v_rule.configuration->'schedule',v_due,(v_cycle->>'through')::date);
  update private.nest_recurring_execution set covered_through=(v_cycle->>'through')::date,next_due_on=(v_next->>'dueOn')::date
    where household_id=p_household and rule_id=v_id;
  insert into public.nest_recurring_cycle_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_link_manual_cycle(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function private.nest_save_manual_cycle(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-cycle-operation:'||auth.uid()::text||':'||p_household::text||':'||p_operation::text,0));
  if exists(select 1 from public.nest_recurring_cycle_save_cancellations
    where actor_id=auth.uid() and household_id=p_household and operation_id=p_operation) then
    raise exception 'Cycle Save abandoned' using errcode='55000'; end if;
  return private.nest_link_manual_cycle(p_household,p_operation,p_input,null);
end;
$$;
create function private.nest_execute_manual_cycle(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_approval is null then raise exception 'Cycle approval required' using errcode='55000'; end if;
  return private.nest_link_manual_cycle($1,$2,$3,$4);
end;
$$;
revoke all on function private.nest_save_manual_cycle(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.nest_execute_manual_cycle(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.nest_save_manual_cycle(uuid,uuid,jsonb) to authenticated;
grant execute on function private.nest_execute_manual_cycle(uuid,uuid,jsonb,uuid) to authenticated;
create function public.nest_save_manual_cycle(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_manual_cycle($1,$2,$3);
$$;
create function public.nest_execute_manual_cycle(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_execute_manual_cycle($1,$2,$3,$4);
$$;
revoke all on function public.nest_save_manual_cycle(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.nest_execute_manual_cycle(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nest_save_manual_cycle(uuid,uuid,jsonb) to authenticated;
grant execute on function public.nest_execute_manual_cycle(uuid,uuid,jsonb,uuid) to authenticated;
