-- GATED: explicit native Save or exact AI approval grants a future mandate.
-- Rule locks precede ledger/category/approval locks for future cycle execution.
create function private.nest_write_recurring(p_household uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql set search_path='' as $$
declare v_rule uuid:=(p_input->>'ruleId')::uuid; v_revision uuid:=gen_random_uuid(); v_status text;
begin
  insert into public.nest_recurring_rules(household_id,id,revision,configuration,status,authorized_by)
    values(p_household,v_rule,v_revision,p_input->'configuration','active',auth.uid())
    on conflict(household_id,id) do update set revision=excluded.revision,configuration=excluded.configuration,
      authorized_by=excluded.authorized_by,authorized_at=clock_timestamp()
    returning status into v_status;
  insert into public.nest_recurring_revisions(household_id,rule_id,revision,authorized_by,approval_id,configuration,first_due_on)
    values(p_household,v_rule,v_revision,auth.uid(),p_approval,p_input->'configuration',(p_input->>'firstDueOn')::date);
  insert into private.nest_recurring_execution(household_id,rule_id,next_due_on)
    values(p_household,v_rule,(p_input->>'firstDueOn')::date)
    on conflict(household_id,rule_id) do update set next_due_on=excluded.next_due_on;
  return jsonb_build_object('revision',v_revision,'status',v_status);
end;
$$;
revoke all on function private.nest_write_recurring(uuid,jsonb,uuid) from public,anon,authenticated;

create function private.nest_set_recurring(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_recurring_receipts;
  v_rule public.nest_recurring_rules; v_execution private.nest_recurring_execution;
  v_id uuid; v_members integer; v_cycle jsonb; v_today date; v_result jsonb; v_command text;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid recurring operation' using errcode='22023'; end if;
  perform private.nest_recurring_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('input',p_input,'approval',p_approval)::text,'UTF8'));
  select * into v_prior from public.nest_recurring_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Recurring operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Recurring rule requires two members' using errcode='23514'; end if;
  v_id:=(p_input->>'ruleId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-rule:'||p_household::text||':'||v_id::text,0));
  select * into v_rule from public.nest_recurring_rules where household_id=p_household and id=v_id for update;
  if v_rule.revision is distinct from (p_input->>'expectedRevision')::uuid or v_rule.status='cancelled' then
    raise exception 'Recurring rule changed' using errcode='40001'; end if;
  select * into v_execution from private.nest_recurring_execution where household_id=p_household and rule_id=v_id for update;
  if v_rule.id is not null and v_execution.rule_id is null then
    raise exception 'Recurring execution unavailable' using errcode='55000'; end if;
  perform private.nest_recurring_configuration(p_household,p_input->'configuration');
  v_today:=(clock_timestamp() at time zone 'Europe/Zurich')::date;
  if v_rule.status='active' and v_execution.next_due_on<v_today then
    raise exception 'Resolve overdue cycles before changing this rule' using errcode='40001'; end if;
  if (p_input->'configuration'->>'startDate')::date<v_today then
    raise exception 'Recurring activation must be prospective' using errcode='22023'; end if;
  v_cycle:=private.nest_recurring_cycle(p_input->'configuration'->'schedule',
    (p_input->'configuration'->>'startDate')::date,v_execution.covered_through);
  if v_cycle is null or v_cycle->>'dueOn' is distinct from p_input->>'firstDueOn' then
    raise exception 'First recurring cycle changed' using errcode='40001'; end if;
  v_command:=case when v_rule.id is null then 'recurring.create' else 'recurring.update' end;
  if p_approval is not null then
    perform private.nest_consume_action_approval(p_approval,p_household,p_operation,v_command,1,p_input);
  end if;
  v_result:=private.nest_write_recurring(p_household,p_input,p_approval)||jsonb_build_object(
    'version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,'approvalId',p_approval,'rule',p_input);
  insert into public.nest_recurring_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_set_recurring(uuid,uuid,jsonb,uuid) from public,anon,authenticated;

create function private.nest_save_recurring(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security definer set search_path='' as $$
  select private.nest_set_recurring($1,$2,$3,null);
$$;
create function private.nest_execute_recurring(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_approval is null then raise exception 'Recurring approval required' using errcode='55000'; end if;
  return private.nest_set_recurring(p_household,p_operation,p_input,p_approval);
end;
$$;
revoke all on function private.nest_save_recurring(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.nest_execute_recurring(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.nest_save_recurring(uuid,uuid,jsonb) to authenticated;
grant execute on function private.nest_execute_recurring(uuid,uuid,jsonb,uuid) to authenticated;
create function public.nest_save_recurring(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_save_recurring($1,$2,$3);
$$;
create function public.nest_execute_recurring(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_execute_recurring($1,$2,$3,$4);
$$;
revoke all on function public.nest_save_recurring(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.nest_execute_recurring(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nest_save_recurring(uuid,uuid,jsonb) to authenticated;
grant execute on function public.nest_execute_recurring(uuid,uuid,jsonb,uuid) to authenticated;
