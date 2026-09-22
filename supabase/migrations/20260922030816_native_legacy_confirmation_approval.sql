-- GATED: private legacy confirmation reviews. Only explicit native decisions may execute.
-- READ COMMITTED operation fence ensures recovery observes earlier execution before retiring intent.
create function private.nest_read_legacy_confirmation_approval(p_household uuid,p_approval uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_operation uuid; v_result jsonb;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select invocation_id into v_operation from public.nest_action_approvals
    where id=p_approval and household_id=p_household and actor_id=v_actor
      and command='recurring.confirm-legacy-draft' and command_version=1;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:legacy-confirmation:'||v_actor::text||':'||p_household::text||':'||v_operation::text,0));
  select jsonb_build_object('version',1,'actorId',a.actor_id,'householdId',a.household_id,'approval',
    jsonb_build_object('id',a.id,'operationId',a.invocation_id,'input',a.payload,'status',a.status,
      'expiresAt',to_char(timezone('UTC',a.expires_at),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'receipt',r.result)) into v_result
    from public.nest_action_approvals a left join private.nest_legacy_confirmation_operations r
      on r.actor_id=a.actor_id and r.household_id=a.household_id and r.operation_id=a.invocation_id
        and r.result->>'approvalId'=a.id::text
    where a.id=p_approval and a.household_id=p_household and a.actor_id=v_actor
      and a.command='recurring.confirm-legacy-draft' and a.command_version=1;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  return v_result;
end;
$$;
revoke all on function private.nest_read_legacy_confirmation_approval(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_legacy_confirmation_approval(uuid,uuid) to authenticated;
create function public.nest_read_legacy_confirmation_approval(p_household uuid,p_approval uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.nest_read_legacy_confirmation_approval($1,$2);
$$;
revoke all on function public.nest_read_legacy_confirmation_approval(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_legacy_confirmation_approval(uuid,uuid) to authenticated;

create function private.nest_decide_legacy_confirmation(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid,p_approved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row public.nest_action_approvals;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_approval is null or p_approved is null then
    raise exception 'Invalid confirmation decision' using errcode='22023'; end if;
  perform private.nest_legacy_confirm_input(p_payload);
  perform pg_advisory_xact_lock(hashtextextended('nest:legacy-confirmation:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  if p_approved and exists(select 1 from private.nest_legacy_confirmation_operations
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation and result is not null) then
    perform private.nest_confirm_legacy_draft(p_household,p_operation,p_payload,p_approval);
    return private.nest_read_legacy_confirmation_approval(p_household,p_approval);
  end if;
  -- Match execution lock order before touching the approval row.
  if p_approved then
    perform 1 from public.expense_drafts where household_id=p_household and id=(p_payload->>'draftId')::uuid for update;
    perform private.lock_household_ledger(p_household);
    -- Validate and hold category share lock before locking approval, matching financial execution.
    perform private.nest_expense_payload(p_payload->'expense',p_household);
  end if;
  v_row:=private.nest_owned_action(p_approval);
  if v_row.household_id is distinct from p_household or v_row.invocation_id is distinct from p_operation
    or v_row.command<>'recurring.confirm-legacy-draft' or v_row.command_version<>1 or v_row.payload is distinct from p_payload then
    raise exception 'Confirmation approval changed' using errcode='22023'; end if;
  if not p_approved then
    -- Explicit withdrawal fences delayed approvals even after expiry or a separate
    -- approval-only request. It cannot undo a confirmation that already committed.
    if v_row.status in ('pending','approved') then
      update public.nest_action_approvals set status='denied',decided_at=clock_timestamp() where id=p_approval;
    end if;
    return private.nest_read_legacy_confirmation_approval(p_household,p_approval);
  end if;
  perform private.nest_decide_action(p_approval,p_operation,'recurring.confirm-legacy-draft',1,p_payload,p_approved);
  if p_approved then perform private.nest_confirm_legacy_draft(p_household,p_operation,p_payload,p_approval); end if;
  return private.nest_read_legacy_confirmation_approval(p_household,p_approval);
end;
$$;
revoke all on function private.nest_decide_legacy_confirmation(uuid,uuid,jsonb,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.nest_decide_legacy_confirmation(uuid,uuid,jsonb,uuid,boolean) to authenticated;
create function public.nest_decide_legacy_confirmation(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid,p_approved boolean)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_decide_legacy_confirmation($1,$2,$3,$4,$5); $$;
revoke all on function public.nest_decide_legacy_confirmation(uuid,uuid,jsonb,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.nest_decide_legacy_confirmation(uuid,uuid,jsonb,uuid,boolean) to authenticated;
create function private.nest_read_legacy_confirmation_context(p_household uuid,p_approval uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a jsonb; i jsonb;
begin
  a:=private.nest_read_legacy_confirmation_approval(p_household,p_approval);
  i:=a->'approval'->'input';
  return jsonb_build_object('version',1,'actorId',auth.uid(),'householdId',p_household,'approvalId',p_approval,'input',i,
    'review',private.nest_read_legacy_draft_context(p_household,(i->>'draftId')::uuid));
end;
$$;
revoke all on function private.nest_read_legacy_confirmation_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_legacy_confirmation_context(uuid,uuid) to authenticated;
create function public.nest_read_legacy_confirmation_context(p_household uuid,p_approval uuid)
returns jsonb language sql volatile security invoker set search_path='' as $$ select private.nest_read_legacy_confirmation_context($1,$2); $$;
revoke all on function public.nest_read_legacy_confirmation_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_legacy_confirmation_context(uuid,uuid) to authenticated;
