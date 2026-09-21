-- GATED: source-only fixed cycle transaction. No public or service-role job entry point yet.
create table public.nest_recurring_cycles (
  household_id uuid not null,
  rule_id uuid not null,
  cycle_key text not null,
  due_on date not null,
  starts_on date not null,
  through_date date not null,
  revision uuid not null,
  event_id uuid not null unique references public.financial_events(id),
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(household_id,rule_id,cycle_key),
  unique(household_id,rule_id,due_on),
  foreign key(household_id,rule_id) references public.nest_recurring_rules(household_id,id),
  check(starts_on<=due_on and due_on<=through_date)
);
alter table public.nest_recurring_cycles enable row level security;
revoke all on public.nest_recurring_cycles from public,anon,authenticated;
grant select on public.nest_recurring_cycles to authenticated;
create policy household_recurring_cycles on public.nest_recurring_cycles for select to authenticated
  using((select private.is_household_member(household_id)));
create trigger nest_recurring_cycles_are_append_only before update or delete on public.nest_recurring_cycles
  for each row execute function private.reject_financial_history_change();

create function private.nest_post_fixed_cycle(p_household uuid,p_rule uuid,p_revision uuid,p_due date)
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
