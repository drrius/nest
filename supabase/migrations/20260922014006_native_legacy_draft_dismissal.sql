-- GATED explicit dismissal only. No financial event is posted, deleted or changed.
alter table public.nest_action_approvals drop constraint nest_action_approvals_command_check;
alter table public.nest_action_approvals add constraint nest_action_approvals_command_check
  check(command in ('expenses.record','expenses.correct','expenses.refund','settlements.record',
    'groceryExpenses.record','recurring.create','recurring.update','recurring.pause','recurring.cancel','recurring.resume',
    'recurring.record-cycle','recurring.link-cycle','recurring.dismiss-legacy-draft','memory.save'));
create table private.nest_legacy_draft_operations (
  actor_id uuid not null,household_id uuid not null,operation_id uuid not null,
  request_hash bytea,result jsonb,created_at timestamptz not null default now(),
  primary key(actor_id,household_id,operation_id),
  check((request_hash is null)=(result is null))
);
revoke all on private.nest_legacy_draft_operations from public,anon,authenticated,service_role;
create trigger nest_legacy_draft_operations_immutable before update or delete on private.nest_legacy_draft_operations
  for each row execute function private.reject_financial_history_change();
create function private.nest_legacy_draft_review(p_draft public.expense_drafts)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='UTC' as $$
declare v_document jsonb;
begin
  v_document:=private.nest_legacy_draft_document(p_draft);
  return jsonb_build_object('version',1,'householdId',p_draft.household_id,'draft',v_document,
    'reviewToken',encode(sha256(convert_to(jsonb_build_object('draft',to_jsonb(p_draft),'eventId',v_document->'eventId')::text,'UTF8')),'hex'));
end;
$$;
revoke all on function private.nest_legacy_draft_review(public.expense_drafts) from public,anon,authenticated,service_role;
create function private.nest_read_legacy_draft_context(p_household uuid,p_draft uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_draft public.expense_drafts;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_draft from public.expense_drafts where household_id=p_household and id=p_draft;
  if not found or v_draft.recurring_expense_rule_id is null then raise exception 'Legacy draft unavailable' using errcode='42501'; end if;
  return private.nest_legacy_draft_review(v_draft);
end;
$$;
revoke all on function private.nest_read_legacy_draft_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_legacy_draft_context(uuid,uuid) to authenticated;
create function public.nest_read_legacy_draft_context(p_household uuid,p_draft uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_legacy_draft_context($1,$2); $$;
revoke all on function public.nest_read_legacy_draft_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_legacy_draft_context(uuid,uuid) to authenticated;
create function private.nest_legacy_dismiss_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>1024
    or not p_input ?& array['draftId','ruleId','reviewToken'] or p_input-array['draftId','ruleId','reviewToken']<>'{}'::jsonb then
    raise exception 'Invalid legacy dismissal' using errcode='22023'; end if;
  if jsonb_typeof(p_input->'draftId') is distinct from 'string' or (p_input->>'draftId')::uuid::text is distinct from p_input->>'draftId'
    or jsonb_typeof(p_input->'ruleId') is distinct from 'string' or (p_input->>'ruleId')::uuid::text is distinct from p_input->>'ruleId'
    or jsonb_typeof(p_input->'reviewToken') is distinct from 'string' or p_input->>'reviewToken' !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid legacy dismissal identity' using errcode='22023'; end if;
end;
$$;
revoke all on function private.nest_legacy_dismiss_input(jsonb) from public,anon,authenticated,service_role;
create function private.nest_dismiss_legacy_draft(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior private.nest_legacy_draft_operations;
  v_draft public.expense_drafts; v_review jsonb; v_result jsonb;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  perform private.nest_legacy_dismiss_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:legacy-draft:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('input',p_input,'approval',p_approval)::text,'UTF8'));
  select * into v_prior from private.nest_legacy_draft_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.result is null then raise exception 'Legacy decision abandoned' using errcode='55000'; end if;
    if v_prior.request_hash<>v_hash then raise exception 'Legacy decision changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  select * into v_draft from public.expense_drafts where household_id=p_household and id=(p_input->>'draftId')::uuid for update;
  if not found or v_draft.recurring_expense_rule_id is distinct from (p_input->>'ruleId')::uuid then
    raise exception 'Legacy draft unavailable' using errcode='42501'; end if;
  perform private.lock_household_ledger(p_household);
  v_review:=private.nest_legacy_draft_review(v_draft);
  if v_review->>'reviewToken' is distinct from p_input->>'reviewToken' then
    raise exception 'Legacy draft changed; review again' using errcode='40001'; end if;
  if v_draft.status<>'pending' or v_draft.source_kind<>'recurring' or v_review->'draft'->>'eventId' is not null then
    raise exception 'Legacy draft requires reconciliation' using errcode='55000'; end if;
  if p_approval is not null then
    perform private.nest_consume_action_approval(p_approval,p_household,p_operation,'recurring.dismiss-legacy-draft',1,p_input);
  end if;
  update public.expense_drafts set status='dismissed' where id=v_draft.id and household_id=p_household;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'approvalId',p_approval,'input',p_input,'reviewed',v_review,'status','dismissed');
  insert into private.nest_legacy_draft_operations(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_dismiss_legacy_draft(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
create function private.nest_save_legacy_dismissal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security definer set search_path='' as $$ select private.nest_dismiss_legacy_draft($1,$2,$3,null); $$;
create function private.nest_execute_legacy_dismissal(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_approval is null then raise exception 'Legacy dismissal approval required' using errcode='55000'; end if;
  return private.nest_dismiss_legacy_draft($1,$2,$3,$4);
end;
$$;
revoke all on function private.nest_save_legacy_dismissal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.nest_execute_legacy_dismissal(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_save_legacy_dismissal(uuid,uuid,jsonb) to authenticated;
grant execute on function private.nest_execute_legacy_dismissal(uuid,uuid,jsonb,uuid) to authenticated;
create function public.nest_save_legacy_dismissal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_save_legacy_dismissal($1,$2,$3); $$;
create function public.nest_execute_legacy_dismissal(p_household uuid,p_operation uuid,p_input jsonb,p_approval uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_execute_legacy_dismissal($1,$2,$3,$4); $$;
revoke all on function public.nest_save_legacy_dismissal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.nest_execute_legacy_dismissal(uuid,uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_legacy_dismissal(uuid,uuid,jsonb) to authenticated;
grant execute on function public.nest_execute_legacy_dismissal(uuid,uuid,jsonb,uuid) to authenticated;
create function private.nest_legacy_dismissal_recovery(p_household uuid,p_operation uuid,p_cancel boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_prior private.nest_legacy_draft_operations; v_status text;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:legacy-draft:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  select * into v_prior from private.nest_legacy_draft_operations where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  v_status:=case when not found then 'unresolved' when v_prior.result is null then 'cancelled' else 'recorded' end;
  if v_prior.result->>'approvalId' is not null then raise exception 'Not a direct Save operation' using errcode='22023'; end if;
  if p_cancel and v_status='unresolved' then
    insert into private.nest_legacy_draft_operations(actor_id,household_id,operation_id) values(v_actor,p_household,p_operation);
    v_status:='cancelled';
  end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,'status',v_status,'receipt',v_prior.result);
end;
$$;
revoke all on function private.nest_legacy_dismissal_recovery(uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function private.nest_read_legacy_dismissal(p_household uuid,p_operation uuid)
returns jsonb language sql security definer set search_path='' as $$ select private.nest_legacy_dismissal_recovery($1,$2,false); $$;
create function private.nest_cancel_legacy_dismissal(p_household uuid,p_operation uuid)
returns jsonb language sql security definer set search_path='' as $$ select private.nest_legacy_dismissal_recovery($1,$2,true); $$;
revoke all on function private.nest_read_legacy_dismissal(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.nest_cancel_legacy_dismissal(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_legacy_dismissal(uuid,uuid) to authenticated;
grant execute on function private.nest_cancel_legacy_dismissal(uuid,uuid) to authenticated;
create function public.nest_read_legacy_dismissal(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_legacy_dismissal($1,$2); $$;
create function public.nest_cancel_legacy_dismissal(p_household uuid,p_operation uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_cancel_legacy_dismissal($1,$2); $$;
revoke all on function public.nest_read_legacy_dismissal(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.nest_cancel_legacy_dismissal(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_legacy_dismissal(uuid,uuid) to authenticated;
grant execute on function public.nest_cancel_legacy_dismissal(uuid,uuid) to authenticated;
