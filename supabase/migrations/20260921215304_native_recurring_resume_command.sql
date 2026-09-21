-- GATED: prospective resumption is fresh authorization; paused backlog is not backfilled.
alter table public.nest_action_approvals drop constraint nest_action_approvals_command_check;
alter table public.nest_action_approvals add constraint nest_action_approvals_command_check
  check(command in ('expenses.record','expenses.correct','expenses.refund','settlements.record',
    'groceryExpenses.record','recurring.create','recurring.update','recurring.pause','recurring.cancel','recurring.resume','memory.save'));
alter table public.nest_recurring_revisions drop constraint nest_recurring_revisions_change_kind_check;
alter table public.nest_recurring_revisions add constraint nest_recurring_revisions_change_kind_check
  check(change_kind in ('configuration','pause','cancel','resume'));
alter table public.nest_recurring_revisions add column resume_from date;
alter table public.nest_recurring_revisions add constraint nest_recurring_resume_date_check
  check((change_kind='resume')=(resume_from is not null) and (resume_from is null or first_due_on>=resume_from));
create function private.nest_recurring_resume_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_key text; v_date date;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or not p_input ?& array['ruleId','expectedRevision','expectedStatus','action','resumeFrom','firstDueOn']
    or p_input-array['ruleId','expectedRevision','expectedStatus','action','resumeFrom','firstDueOn']<>'{}'::jsonb
    or p_input->'expectedStatus' is distinct from '"paused"'::jsonb or p_input->'action' is distinct from '"resume"'::jsonb then
    raise exception 'Invalid recurring resumption' using errcode='22023'; end if;
  -- Reuse the strict canonical state identity validator without expanding its stop-only schema.
  perform private.nest_recurring_state_input((p_input-array['resumeFrom','firstDueOn'])||'{"action":"cancel"}'::jsonb);
  foreach v_key in array array['resumeFrom','firstDueOn'] loop
    if jsonb_typeof(p_input->v_key) is distinct from 'string' or p_input->>v_key !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid resumption date' using errcode='22023'; end if;
    v_date:=(p_input->>v_key)::date;
    if not isfinite(v_date) or v_date<date '0001-01-01' or v_date>date '9999-12-31'
      or to_char(v_date,'YYYY-MM-DD')<>p_input->>v_key then
      raise exception 'Invalid resumption date' using errcode='22023'; end if;
  end loop;
  if p_input->>'firstDueOn'<p_input->>'resumeFrom' then
    raise exception 'Invalid first resumption cycle' using errcode='22023'; end if;
end;
$$;
revoke all on function private.nest_recurring_resume_input(jsonb) from public,anon,authenticated;
create function private.nest_resume_recurring(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_recurring_state_receipts;
  v_rule public.nest_recurring_rules; v_execution private.nest_recurring_execution;
  v_revision uuid:=gen_random_uuid(); v_id uuid; v_members integer; v_cycle jsonb; v_result jsonb; v_from date;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid resumption operation' using errcode='22023'; end if;
  perform private.nest_recurring_resume_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-state-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('input',p_input,'approval',p_approval)::text,'UTF8'));
  select * into v_prior from public.nest_recurring_state_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Recurring state operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  if p_approval is null and exists(select 1 from public.nest_recurring_state_save_cancellations
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation) then
    raise exception 'Recurring state request abandoned' using errcode='40001'; end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Recurring resumption requires two members' using errcode='23514'; end if;
  v_id:=(p_input->>'ruleId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-rule:'||p_household::text||':'||v_id::text,0));
  select * into v_rule from public.nest_recurring_rules where household_id=p_household and id=v_id for update;
  if not found or v_rule.revision<>(p_input->>'expectedRevision')::uuid or v_rule.status<>'paused' then
    raise exception 'Recurring rule changed' using errcode='40001'; end if;
  select * into v_execution from private.nest_recurring_execution where household_id=p_household and rule_id=v_id for update;
  if not found then raise exception 'Recurring execution unavailable' using errcode='55000'; end if;
  v_from:=(p_input->>'resumeFrom')::date;
  if v_from<(clock_timestamp() at time zone 'Europe/Zurich')::date or v_from<(v_rule.configuration->>'startDate')::date then
    raise exception 'Resumption must be prospective' using errcode='40001'; end if;
  v_cycle:=private.nest_recurring_cycle(v_rule.configuration->'schedule',v_from,v_execution.covered_through);
  if v_cycle is null or v_cycle->>'dueOn' is distinct from p_input->>'firstDueOn' then
    raise exception 'First resumption cycle changed' using errcode='40001'; end if;
  perform private.nest_recurring_configuration(p_household,v_rule.configuration);
  if p_approval is not null then
    perform private.nest_consume_action_approval(p_approval,p_household,p_operation,'recurring.resume',1,p_input);
  end if;
  update public.nest_recurring_rules set status='active',revision=v_revision,authorized_by=v_actor,authorized_at=clock_timestamp()
    where household_id=p_household and id=v_id;
  update private.nest_recurring_execution set next_due_on=(p_input->>'firstDueOn')::date
    where household_id=p_household and rule_id=v_id;
  insert into public.nest_recurring_revisions(household_id,rule_id,revision,authorized_by,approval_id,configuration,first_due_on,change_kind,resume_from)
    values(p_household,v_id,v_revision,v_actor,p_approval,v_rule.configuration,(p_input->>'firstDueOn')::date,'resume',v_from);
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'approvalId',p_approval,'revision',v_revision,'status','active','change',p_input,
    'configuration',v_rule.configuration,'coveredThrough',v_execution.covered_through);
  insert into public.nest_recurring_state_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_resume_recurring(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
create function private.nest_save_recurring_resume(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select private.nest_resume_recurring($1,$2,$3,null);
$$;
create function private.nest_execute_recurring_resume(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_approval is null then raise exception 'Resumption approval required' using errcode='55000'; end if;
  return private.nest_resume_recurring($1,$2,$3,$4);
end;
$$;
revoke all on function private.nest_save_recurring_resume(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.nest_execute_recurring_resume(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.nest_save_recurring_resume(uuid,uuid,jsonb) to authenticated;
grant execute on function private.nest_execute_recurring_resume(uuid,uuid,jsonb,uuid) to authenticated;
create function public.nest_save_recurring_resume(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_save_recurring_resume($1,$2,$3); $$;
create function public.nest_execute_recurring_resume(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_execute_recurring_resume($1,$2,$3,$4); $$;
revoke all on function public.nest_save_recurring_resume(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.nest_execute_recurring_resume(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nest_save_recurring_resume(uuid,uuid,jsonb) to authenticated;
grant execute on function public.nest_execute_recurring_resume(uuid,uuid,jsonb,uuid) to authenticated;
