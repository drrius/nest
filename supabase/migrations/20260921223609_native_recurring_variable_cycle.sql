-- GATED: explicit per-cycle amount/split confirmation. Never a scheduler permission.
alter table public.nest_action_approvals drop constraint nest_action_approvals_command_check;
alter table public.nest_action_approvals add constraint nest_action_approvals_command_check
  check(command in ('expenses.record','expenses.correct','expenses.refund','settlements.record',
    'groceryExpenses.record','recurring.create','recurring.update','recurring.pause','recurring.cancel','recurring.resume','recurring.record-cycle','memory.save'));
create table public.nest_recurring_cycle_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null, result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_recurring_cycle_receipts enable row level security;
revoke all on public.nest_recurring_cycle_receipts from public,anon,authenticated;
grant select on public.nest_recurring_cycle_receipts to authenticated;
create policy own_recurring_cycle_receipts on public.nest_recurring_cycle_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));
create trigger nest_recurring_cycle_receipts_are_append_only before update or delete on public.nest_recurring_cycle_receipts
  for each row execute function private.reject_financial_history_change();
create function private.nest_variable_cycle_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_due date;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>32768
    or not p_input ?& array['ruleId','expectedRevision','dueOn','amountCentimes','allocations']
    or p_input-array['ruleId','expectedRevision','dueOn','amountCentimes','allocations']<>'{}'::jsonb then
    raise exception 'Invalid variable cycle' using errcode='22023'; end if;
  if jsonb_typeof(p_input->'ruleId') is distinct from 'string'
    or jsonb_typeof(p_input->'expectedRevision') is distinct from 'string'
    or (p_input->>'ruleId')::uuid::text is distinct from p_input->>'ruleId'
    or (p_input->>'expectedRevision')::uuid::text is distinct from p_input->>'expectedRevision'
    or jsonb_typeof(p_input->'dueOn') is distinct from 'string'
    or (p_input->>'dueOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid variable cycle identity' using errcode='22023'; end if;
  v_due:=(p_input->>'dueOn')::date;
  if not isfinite(v_due) or to_char(v_due,'YYYY-MM-DD')<>p_input->>'dueOn'
    or v_due<date '0001-01-01' or v_due>date '9999-12-31' then
    raise exception 'Invalid variable cycle date' using errcode='22023'; end if;
end;
$$;
revoke all on function private.nest_variable_cycle_input(jsonb) from public,anon,authenticated;
create function private.nest_record_variable_cycle(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_recurring_cycle_receipts;
  v_rule public.nest_recurring_rules; v_cursor private.nest_recurring_execution;
  v_id uuid; v_due date; v_members integer; v_cycle jsonb; v_next jsonb;
  v_expense jsonb; v_allocations jsonb; v_event uuid; v_result jsonb;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid cycle operation' using errcode='22023'; end if;
  perform private.nest_variable_cycle_input(p_input);
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
  if v_members<>2 then raise exception 'Variable cycle requires two members' using errcode='42501'; end if;
  v_id:=(p_input->>'ruleId')::uuid; v_due:=(p_input->>'dueOn')::date;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-rule:'||p_household::text||':'||v_id::text,0));
  select * into v_rule from public.nest_recurring_rules where household_id=p_household and id=v_id for update;
  if not found or v_rule.revision<>(p_input->>'expectedRevision')::uuid or v_rule.status<>'active'
    or v_rule.configuration->>'mode'<>'variable' then
    raise exception 'Variable rule changed' using errcode='40001'; end if;
  select * into v_cursor from private.nest_recurring_execution where household_id=p_household and rule_id=v_id for update;
  if not found then raise exception 'Recurring execution unavailable' using errcode='55000'; end if;
  if v_cursor.next_due_on is distinct from v_due or v_due>(clock_timestamp() at time zone 'Europe/Zurich')::date
    or v_due<(v_rule.configuration->>'startDate')::date then
    raise exception 'Variable cycle is not due' using errcode='40001'; end if;
  v_cycle:=private.nest_recurring_cycle(v_rule.configuration->'schedule',v_due,v_cursor.covered_through);
  if v_cycle is null or v_cycle->>'dueOn' is distinct from p_input->>'dueOn'
    or exists(select 1 from public.nest_recurring_cycles where household_id=p_household and rule_id=v_id and cycle_key=v_cycle->>'key') then
    raise exception 'Cycle already covered' using errcode='40001'; end if;
  perform private.lock_household_ledger(p_household);
  v_expense:=(v_rule.configuration-array['startDate','schedule','mode'])||jsonb_build_object(
    'date',p_input->>'dueOn','amountCentimes',p_input->'amountCentimes','allocations',p_input->'allocations');
  v_allocations:=private.nest_expense_payload(v_expense,p_household);
  if p_approval is not null then
    perform private.nest_consume_action_approval(p_approval,p_household,p_operation,'recurring.record-cycle',1,p_input);
  end if;
  v_event:=private.post_financial_event(p_household,v_actor,'expense',(v_expense->>'payerId')::uuid,
    v_expense->>'description',(v_expense->>'amountCentimes')::bigint,v_allocations,v_due,null,
    (v_expense->>'categoryId')::uuid,v_expense->>'note',null,null,null,null);
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'approvalId',p_approval,'source','variable','eventId',v_event,'input',p_input,'cycle',v_cycle,
    'configuration',v_rule.configuration,'expense',v_expense);
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
revoke all on function private.nest_record_variable_cycle(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function private.nest_save_variable_cycle(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select private.nest_record_variable_cycle($1,$2,$3,null);
$$;
create function private.nest_execute_variable_cycle(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_approval is null then raise exception 'Cycle approval required' using errcode='55000'; end if;
  return private.nest_record_variable_cycle($1,$2,$3,$4);
end;
$$;
revoke all on function private.nest_save_variable_cycle(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.nest_execute_variable_cycle(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.nest_save_variable_cycle(uuid,uuid,jsonb) to authenticated;
grant execute on function private.nest_execute_variable_cycle(uuid,uuid,jsonb,uuid) to authenticated;
create function public.nest_save_variable_cycle(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_variable_cycle($1,$2,$3);
$$;
create function public.nest_execute_variable_cycle(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_execute_variable_cycle($1,$2,$3,$4);
$$;
revoke all on function public.nest_save_variable_cycle(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.nest_execute_variable_cycle(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nest_save_variable_cycle(uuid,uuid,jsonb) to authenticated;
grant execute on function public.nest_execute_variable_cycle(uuid,uuid,jsonb,uuid) to authenticated;

-- Historical automatic retry must not reinterpret an explicitly confirmed cycle.
create or replace function private.nest_post_fixed_cycle(p_household uuid,p_rule uuid,p_revision uuid,p_due date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rule public.nest_recurring_rules; v_cursor private.nest_recurring_execution;
  v_prior public.nest_recurring_cycles; v_cycle jsonb; v_next jsonb; v_expense jsonb; v_allocations jsonb;
  v_members integer; v_event uuid; v_result jsonb;
begin
  if p_household is null or p_rule is null or p_revision is null or p_due is null
    or not isfinite(p_due) or p_due<date '0001-01-01' or p_due>date '9999-12-31' then
    raise exception 'Invalid fixed cycle identity' using errcode='22023'; end if;
  -- Match native command ordering: membership, rule, execution, ledger, category.
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Recurring cycle requires two current members' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-rule:'||p_household::text||':'||p_rule::text,0));
  select * into v_rule from public.nest_recurring_rules where household_id=p_household and id=p_rule for update;
  if not found then raise exception 'Recurring rule unavailable' using errcode='P0002'; end if;
  select * into v_prior from public.nest_recurring_cycles
    where household_id=p_household and rule_id=p_rule and due_on=p_due;
  if found then
    if v_prior.revision<>p_revision then raise exception 'Cycle mandate changed' using errcode='40001'; end if;
    if v_prior.result->>'source' is distinct from 'automatic' then
      raise exception 'Cycle already confirmed explicitly' using errcode='40001'; end if;
    return v_prior.result;
  end if;
  if v_rule.revision<>p_revision or v_rule.status<>'active' or v_rule.configuration->>'mode'<>'fixed' then
    raise exception 'Fixed cycle mandate changed' using errcode='40001'; end if;
  if not exists(select 1 from public.household_members where household_id=p_household and user_id=v_rule.authorized_by) then
    raise exception 'Mandate authorizer is no longer a member' using errcode='42501'; end if;
  select * into v_cursor from private.nest_recurring_execution where household_id=p_household and rule_id=p_rule for update;
  if not found then raise exception 'Recurring execution unavailable' using errcode='55000'; end if;
  if v_cursor.next_due_on is distinct from p_due
    or p_due>(clock_timestamp() at time zone 'Europe/Zurich')::date
    or p_due<(v_rule.configuration->>'startDate')::date then
    raise exception 'Cycle is not the next authorized due date' using errcode='40001'; end if;
  v_cycle:=private.nest_recurring_cycle(v_rule.configuration->'schedule',p_due,v_cursor.covered_through);
  if v_cycle is null or (v_cycle->>'dueOn')::date<>p_due then
    raise exception 'Cycle coverage changed' using errcode='40001'; end if;
  perform private.lock_household_ledger(p_household);
  v_expense:=(v_rule.configuration-array['startDate','schedule','mode'])||jsonb_build_object('date',to_char(p_due,'YYYY-MM-DD'));
  v_allocations:=private.nest_expense_payload(v_expense,p_household);
  -- The ledger actor is the retained mandate authorizer; automatic origin is in the receipt.
  v_event:=private.post_financial_event(p_household,v_rule.authorized_by,'expense',
    (v_expense->>'payerId')::uuid,v_expense->>'description',(v_expense->>'amountCentimes')::bigint,
    v_allocations,p_due,null,(v_expense->>'categoryId')::uuid,v_expense->>'note',null,null,null,null);
  v_result:=jsonb_build_object('version',1,'householdId',p_household,'ruleId',p_rule,'revision',p_revision,
    'source','automatic','authorizedBy',v_rule.authorized_by,'eventId',v_event,'cycle',v_cycle,'configuration',v_rule.configuration);
  insert into public.nest_recurring_cycles(household_id,rule_id,cycle_key,due_on,starts_on,through_date,revision,event_id,result)
    values(p_household,p_rule,v_cycle->>'key',p_due,(v_cycle->>'startsOn')::date,(v_cycle->>'through')::date,p_revision,v_event,v_result);
  v_next:=private.nest_recurring_cycle(v_rule.configuration->'schedule',p_due,(v_cycle->>'through')::date);
  update private.nest_recurring_execution set covered_through=(v_cycle->>'through')::date,
    next_due_on=(v_next->>'dueOn')::date where household_id=p_household and rule_id=p_rule;
  return v_result;
end;
$$;
revoke all on function private.nest_post_fixed_cycle(uuid,uuid,uuid,date) from public,anon,authenticated;
