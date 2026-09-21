-- GATED: stopping a recurring mandate preserves its configuration and consumed coverage.
alter table public.nest_recurring_revisions add column change_kind text not null default 'configuration'
  check(change_kind in ('configuration','pause','cancel'));
create table public.nest_recurring_state_receipts (
  actor_id uuid not null,
  household_id uuid not null,
  operation_id uuid not null,
  request_hash bytea not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_recurring_state_receipts enable row level security;
revoke all on public.nest_recurring_state_receipts from public,anon,authenticated;
grant select on public.nest_recurring_state_receipts to authenticated;
create policy own_recurring_state_receipts on public.nest_recurring_state_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));
create trigger nest_recurring_state_receipts_are_append_only before update or delete on public.nest_recurring_state_receipts
  for each row execute function private.reject_financial_history_change();

create function private.nest_recurring_state_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or not p_input ?& array['ruleId','expectedRevision','expectedStatus','action']
    or p_input-array['ruleId','expectedRevision','expectedStatus','action']<>'{}'::jsonb
    or jsonb_typeof(p_input->'expectedStatus') is distinct from 'string'
    or p_input->>'expectedStatus' not in ('active','paused')
    or jsonb_typeof(p_input->'action') is distinct from 'string'
    or p_input->>'action' not in ('pause','cancel')
    or (p_input->>'action'='pause' and p_input->>'expectedStatus'<>'active') then
    raise exception 'Invalid recurring state change' using errcode='22023'; end if;
  if jsonb_typeof(p_input->'ruleId') is distinct from 'string'
    or jsonb_typeof(p_input->'expectedRevision') is distinct from 'string'
    or (p_input->>'ruleId')::uuid::text is distinct from p_input->>'ruleId'
    or (p_input->>'expectedRevision')::uuid::text is distinct from p_input->>'expectedRevision' then
    raise exception 'Invalid recurring state identity' using errcode='22023'; end if;
end;
$$;
revoke all on function private.nest_recurring_state_input(jsonb) from public,anon,authenticated;

create function private.nest_change_recurring_state(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_recurring_state_receipts;
  v_rule public.nest_recurring_rules; v_history public.nest_recurring_revisions;
  v_revision uuid:=gen_random_uuid(); v_id uuid; v_members integer; v_status text; v_result jsonb;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid state operation' using errcode='22023'; end if;
  perform private.nest_recurring_state_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-state-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('input',p_input,'approval',p_approval)::text,'UTF8'));
  select * into v_prior from public.nest_recurring_state_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Recurring state operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Recurring change requires two members' using errcode='23514'; end if;
  v_id:=(p_input->>'ruleId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-rule:'||p_household::text||':'||v_id::text,0));
  select * into v_rule from public.nest_recurring_rules where household_id=p_household and id=v_id for update;
  if not found then raise exception 'Recurring rule unavailable' using errcode='P0002'; end if;
  if v_rule.revision<>(p_input->>'expectedRevision')::uuid or v_rule.status<>p_input->>'expectedStatus' then
    raise exception 'Recurring rule changed' using errcode='40001'; end if;
  perform 1 from private.nest_recurring_execution where household_id=p_household and rule_id=v_id for update;
  if not found then raise exception 'Recurring execution unavailable' using errcode='55000'; end if;
  select * into v_history from public.nest_recurring_revisions
    where household_id=p_household and rule_id=v_id and revision=v_rule.revision;
  if not found then raise exception 'Recurring history unavailable' using errcode='55000'; end if;
  if p_approval is not null then
    perform private.nest_consume_action_approval(p_approval,p_household,p_operation,'recurring.'||(p_input->>'action'),1,p_input);
  end if;
  v_status:=case when p_input->>'action'='pause' then 'paused' else 'cancelled' end;
  -- A fresh authorization revision invalidates previously captured configuration approvals.
  -- Stopping is recorded explicitly; it does not grant another automatic mandate.
  update public.nest_recurring_rules set status=v_status,revision=v_revision
    where household_id=p_household and id=v_id;
  insert into public.nest_recurring_revisions(household_id,rule_id,revision,authorized_by,approval_id,configuration,first_due_on,change_kind)
    values(p_household,v_id,v_revision,v_actor,p_approval,v_rule.configuration,v_history.first_due_on,p_input->>'action');
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'approvalId',p_approval,'revision',v_revision,'status',v_status,'change',p_input);
  insert into public.nest_recurring_state_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_change_recurring_state(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function private.nest_save_recurring_state(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select private.nest_change_recurring_state($1,$2,$3,null);
$$;
create function private.nest_execute_recurring_state(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_approval is null then raise exception 'Recurring state approval required' using errcode='55000'; end if;
  return private.nest_change_recurring_state($1,$2,$3,$4);
end;
$$;
revoke all on function private.nest_save_recurring_state(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.nest_execute_recurring_state(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.nest_save_recurring_state(uuid,uuid,jsonb) to authenticated;
grant execute on function private.nest_execute_recurring_state(uuid,uuid,jsonb,uuid) to authenticated;
create function public.nest_save_recurring_state(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_recurring_state($1,$2,$3);
$$;
create function public.nest_execute_recurring_state(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_execute_recurring_state($1,$2,$3,$4);
$$;
revoke all on function public.nest_save_recurring_state(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.nest_execute_recurring_state(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nest_save_recurring_state(uuid,uuid,jsonb) to authenticated;
grant execute on function public.nest_execute_recurring_state(uuid,uuid,jsonb,uuid) to authenticated;
