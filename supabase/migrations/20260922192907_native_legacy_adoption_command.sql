-- GATED: explicit per-rule adoption only; retain history and never backfill overlapping periods.
alter table public.nest_action_approvals drop constraint nest_action_approvals_command_check;
alter table public.nest_action_approvals add constraint nest_action_approvals_command_check
  check(command in ('expenses.record','expenses.correct','expenses.refund','settlements.record',
    'groceryExpenses.record','recurring.create','recurring.update','recurring.pause','recurring.cancel','recurring.resume',
    'recurring.record-cycle','recurring.link-cycle','recurring.dismiss-legacy-draft','recurring.confirm-legacy-draft','recurring.adopt-legacy','memory.save'));

create table private.nest_legacy_adoption_operations (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea, result jsonb, created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id), check((request_hash is null)=(result is null))
);
revoke all on private.nest_legacy_adoption_operations from public,anon,authenticated,service_role;
create trigger nest_legacy_adoption_operations_immutable before update or delete on private.nest_legacy_adoption_operations
  for each row execute function private.reject_financial_history_change();
create function private.nest_legacy_adoption_input(p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_native jsonb;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>32768
    or not p_input ?& array['ruleId','reviewToken','configuration','firstDueOn']
    or p_input-array['ruleId','reviewToken','configuration','firstDueOn']<>'{}'::jsonb
    or jsonb_typeof(p_input->'reviewToken') is distinct from 'string' or p_input->>'reviewToken' !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid adoption input' using errcode='22023'; end if;
  v_native:=(p_input-'reviewToken')||jsonb_build_object('expectedRevision',null);
  perform private.nest_recurring_input(v_native);
  return v_native;
end;
$$;
revoke all on function private.nest_legacy_adoption_input(jsonb) from public,anon,authenticated,service_role;
create function private.nest_adopt_legacy_recurring(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior private.nest_legacy_adoption_operations;
  v_rule public.recurring_expense_rules; v_native jsonb; v_review jsonb; v_cycle jsonb; v_result jsonb; v_members integer;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  v_native:=private.nest_legacy_adoption_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:legacy-adoption-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('input',p_input,'approval',p_approval)::text,'UTF8'));
  select * into v_prior from private.nest_legacy_adoption_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.result is null then raise exception 'Adoption Save abandoned' using errcode='55000'; end if;
    if v_prior.request_hash<>v_hash then raise exception 'Adoption operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  -- A frozen transaction snapshot can predate a draft insert even after all
  -- advisory/row locks are acquired. PostgREST uses READ COMMITTED; require it.
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Adoption requires READ COMMITTED isolation' using errcode='25001'; end if;
  perform 1 from public.household_members where household_id=p_household order by user_id for key share;
  get diagnostics v_members=row_count;
  if v_members<>2 then raise exception 'Recurring rule requires two members' using errcode='23514'; end if;
  -- The key must precede the legacy row: trigger writers fail fast on contention.
  perform pg_advisory_xact_lock(hashtextextended('nest:legacy-adoption:'||p_household::text||':'||(p_input->>'ruleId'),0));
  select * into v_rule from public.recurring_expense_rules where household_id=p_household and id=(p_input->>'ruleId')::uuid for update;
  if not found then raise exception 'Legacy rule unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:recurring-rule:'||p_household::text||':'||v_rule.id::text,0));
  perform private.lock_household_ledger(p_household);
  v_review:=private.nest_legacy_adoption_review(v_rule);
  if v_review->>'reviewToken' is distinct from p_input->>'reviewToken' then
    raise exception 'Legacy source changed; review again' using errcode='40001'; end if;
  if v_review->'blockers'<>'[]'::jsonb then raise exception 'Legacy source requires reconciliation' using errcode='55000'; end if;
  perform private.nest_recurring_configuration(p_household,p_input->'configuration');
  if (p_input->'configuration'->>'startDate')::date<(clock_timestamp() at time zone 'Europe/Zurich')::date then
    raise exception 'Adoption must be prospective' using errcode='22023'; end if;
  v_cycle:=private.nest_recurring_cycle(p_input->'configuration'->'schedule',
    (p_input->'configuration'->>'startDate')::date,(v_review->>'coveredThrough')::date);
  if v_cycle is null or v_cycle->>'dueOn' is distinct from p_input->>'firstDueOn' then
    raise exception 'First adoption cycle changed' using errcode='40001'; end if;
  if p_approval is not null then
    perform private.nest_consume_action_approval(p_approval,p_household,p_operation,'recurring.adopt-legacy',1,p_input);
  end if;
  -- Update even an inactive source so stale repeatable-read writers must serialize.
  update public.recurring_expense_rules set active=false where household_id=p_household and id=v_rule.id;
  v_result:=private.nest_write_recurring(p_household,v_native,p_approval);
  update private.nest_recurring_execution set covered_through=(v_review->>'coveredThrough')::date
    where household_id=p_household and rule_id=v_rule.id;
  insert into private.nest_legacy_recurring_adoptions(household_id,legacy_rule_id,native_rule_id,source_review_token,authorized_by)
    values(p_household,v_rule.id,v_rule.id,p_input->>'reviewToken',v_actor);
  v_result:=v_result||jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'approvalId',p_approval,'input',p_input,'reviewed',v_review);
  insert into private.nest_legacy_adoption_operations(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_adopt_legacy_recurring(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
create function private.nest_save_legacy_adoption(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security definer set search_path='' as $$ select private.nest_adopt_legacy_recurring($1,$2,$3,null); $$;
create function private.nest_execute_legacy_adoption(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_approval is null then raise exception 'Legacy adoption approval required' using errcode='55000'; end if;
  return private.nest_adopt_legacy_recurring($1,$2,$3,$4);
end;
$$;
revoke all on function private.nest_save_legacy_adoption(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.nest_execute_legacy_adoption(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_save_legacy_adoption(uuid,uuid,jsonb) to authenticated;
grant execute on function private.nest_execute_legacy_adoption(uuid,uuid,jsonb,uuid) to authenticated;
create function public.nest_save_legacy_adoption(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_save_legacy_adoption($1,$2,$3); $$;
create function public.nest_execute_legacy_adoption(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_execute_legacy_adoption($1,$2,$3,$4); $$;
revoke all on function public.nest_save_legacy_adoption(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.nest_execute_legacy_adoption(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_legacy_adoption(uuid,uuid,jsonb) to authenticated;
grant execute on function public.nest_execute_legacy_adoption(uuid,uuid,jsonb,uuid) to authenticated;
create function private.nest_legacy_adoption_recovery(p_household uuid,p_operation uuid,p_cancel boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_prior private.nest_legacy_adoption_operations; v_status text;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:legacy-adoption-operation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  select * into v_prior from private.nest_legacy_adoption_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  v_status:=case when not found then 'unresolved' when v_prior.result is null then 'cancelled' else 'recorded' end;
  if v_prior.result->>'approvalId' is not null then raise exception 'Not a direct Save operation' using errcode='22023'; end if;
  if p_cancel and v_status='unresolved' then
    insert into private.nest_legacy_adoption_operations(actor_id,household_id,operation_id) values(v_actor,p_household,p_operation);
    v_status:='cancelled';
  end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,'status',v_status,'receipt',v_prior.result);
end;
$$;
revoke all on function private.nest_legacy_adoption_recovery(uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function private.nest_read_legacy_adoption(p_household uuid,p_operation uuid)
returns jsonb language sql security definer set search_path='' as $$ select private.nest_legacy_adoption_recovery($1,$2,false); $$;
create function private.nest_cancel_legacy_adoption(p_household uuid,p_operation uuid)
returns jsonb language sql security definer set search_path='' as $$ select private.nest_legacy_adoption_recovery($1,$2,true); $$;
revoke all on function private.nest_read_legacy_adoption(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.nest_cancel_legacy_adoption(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_legacy_adoption(uuid,uuid) to authenticated;
grant execute on function private.nest_cancel_legacy_adoption(uuid,uuid) to authenticated;
create function public.nest_read_legacy_adoption(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_legacy_adoption($1,$2); $$;
create function public.nest_cancel_legacy_adoption(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_cancel_legacy_adoption($1,$2); $$;
revoke all on function public.nest_read_legacy_adoption(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.nest_cancel_legacy_adoption(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_legacy_adoption(uuid,uuid) to authenticated;
grant execute on function public.nest_cancel_legacy_adoption(uuid,uuid) to authenticated;
