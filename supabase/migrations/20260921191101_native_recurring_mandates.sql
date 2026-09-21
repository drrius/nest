-- GATED: native-only mandate state; legacy recurring rules remain draft-only.
create table public.nest_recurring_rules (
  household_id uuid not null,
  id uuid not null,
  revision uuid not null,
  configuration jsonb not null,
  status text not null check(status in ('active','paused','cancelled')),
  authorized_by uuid not null,
  authorized_at timestamptz not null default clock_timestamp(),
  primary key(household_id,id)
);
create table private.nest_recurring_execution (
  household_id uuid not null,
  rule_id uuid not null,
  covered_through date,
  next_due_on date,
  primary key(household_id,rule_id),
  foreign key(household_id,rule_id) references public.nest_recurring_rules(household_id,id)
);
create table public.nest_recurring_revisions (
  household_id uuid not null,
  rule_id uuid not null,
  revision uuid not null,
  authorized_by uuid not null,
  approval_id uuid,
  configuration jsonb not null,
  first_due_on date not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(household_id,rule_id,revision),
  foreign key(household_id,rule_id) references public.nest_recurring_rules(household_id,id)
);
create table public.nest_recurring_receipts (
  actor_id uuid not null,
  household_id uuid not null,
  operation_id uuid not null,
  request_hash bytea not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_recurring_rules enable row level security;
alter table private.nest_recurring_execution enable row level security;
alter table public.nest_recurring_revisions enable row level security;
alter table public.nest_recurring_receipts enable row level security;
revoke all on public.nest_recurring_rules,private.nest_recurring_execution,
  public.nest_recurring_revisions,public.nest_recurring_receipts from public,anon,authenticated;
grant select on public.nest_recurring_rules,public.nest_recurring_revisions,public.nest_recurring_receipts to authenticated;
create policy household_recurring_rules on public.nest_recurring_rules for select to authenticated
  using((select private.is_household_member(household_id)));
create policy household_recurring_revisions on public.nest_recurring_revisions for select to authenticated
  using((select private.is_household_member(household_id)));
create policy own_recurring_receipts on public.nest_recurring_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));
create trigger nest_recurring_revisions_are_append_only before update or delete on public.nest_recurring_revisions
  for each row execute function private.reject_financial_history_change();
create trigger nest_recurring_receipts_are_append_only before update or delete on public.nest_recurring_receipts
  for each row execute function private.reject_financial_history_change();

create function private.nest_recurring_configuration(p_household uuid,p_config jsonb)
returns void language plpgsql set search_path='' as $$
declare v_expense jsonb; v_shares jsonb;
begin
  if p_config is null or jsonb_typeof(p_config) is distinct from 'object'
    or not p_config ?& array['description','payerId','categoryId','note','startDate','schedule','mode','amountCentimes','allocations']
    or p_config-array['description','payerId','categoryId','note','startDate','schedule','mode','amountCentimes','allocations']<>'{}'::jsonb
    or p_config->>'mode' not in ('fixed','variable') or jsonb_typeof(p_config->'mode') is distinct from 'string' then
    raise exception 'Invalid recurring configuration' using errcode='22023';
  end if;
  perform private.nest_recurring_day(p_config->'schedule');
  v_expense:=(p_config-array['startDate','schedule','mode'])||jsonb_build_object('date',p_config->'startDate');
  if p_config->>'mode'='variable' then
    if p_config->'amountCentimes'<>'null'::jsonb or p_config->'allocations'<>'null'::jsonb then
      raise exception 'Variable bills require per-cycle amount and split' using errcode='22023';
    end if;
    select jsonb_agg(jsonb_build_object('memberId',user_id,'centimes','0') order by user_id)
      into v_shares from public.household_members where household_id=p_household;
    v_expense:=v_expense||jsonb_build_object('amountCentimes','0','allocations',v_shares);
  end if;
  perform private.nest_expense_payload(v_expense,p_household);
end;
$$;
revoke all on function private.nest_recurring_configuration(uuid,jsonb) from public,anon,authenticated;

create function private.nest_recurring_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>32768
    or not p_input ?& array['ruleId','expectedRevision','configuration','firstDueOn']
    or p_input-array['ruleId','expectedRevision','configuration','firstDueOn']<>'{}'::jsonb
    or jsonb_typeof(p_input->'ruleId') is distinct from 'string'
    or (p_input->>'ruleId')::uuid::text is distinct from p_input->>'ruleId'
    or jsonb_typeof(p_input->'expectedRevision') not in ('null','string')
    or ((p_input->>'expectedRevision') is not null and (p_input->>'expectedRevision')::uuid::text is distinct from p_input->>'expectedRevision')
    or jsonb_typeof(p_input->'firstDueOn') is distinct from 'string'
    or (p_input->>'firstDueOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Invalid recurring input' using errcode='22023';
  end if;
exception when invalid_text_representation then
  raise exception 'Invalid recurring input' using errcode='22023';
end;
$$;
revoke all on function private.nest_recurring_input(jsonb) from public,anon,authenticated;
