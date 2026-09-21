-- GATED: durable refund proposal reads and atomic native confirmation.
-- Confirmation/denial is never registered as an AI tool.
create function private.nest_read_refund_approval(p_household uuid,p_approval uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select jsonb_build_object('version',1,'actorId',a.actor_id,'householdId',a.household_id,'approval',
    jsonb_build_object('id',a.id,'operationId',a.invocation_id,'refund',a.payload,'status',a.status,
      'expiresAt',to_char(timezone('UTC',a.expires_at),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'receipt',r.result)) into v_result
    from public.nest_action_approvals a left join public.nest_refund_receipts r
      on r.actor_id=a.actor_id and r.household_id=a.household_id and r.operation_id=a.invocation_id
        and r.result->>'approvalId'=a.id::text
    where a.id=p_approval and a.household_id=p_household and a.actor_id=auth.uid()
      and a.command='expenses.refund' and a.command_version=1;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  return v_result;
end;
$$;
revoke all on function private.nest_read_refund_approval(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_read_refund_approval(uuid,uuid) to authenticated;
create function public.nest_read_refund_approval(p_household uuid,p_approval uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_read_refund_approval($1,$2);
$$;
revoke all on function public.nest_read_refund_approval(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_read_refund_approval(uuid,uuid) to authenticated;

create function private.nest_decide_refund(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid,p_approved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row public.nest_action_approvals;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_approval is null or p_approved is null or p_payload is null or octet_length(p_payload::text)>32768 then
    raise exception 'Invalid refund decision' using errcode='22023';
  end if;
  -- Serialize decisions with execution; historical receipts do not revalidate current caps.
  perform pg_advisory_xact_lock(hashtextextended('nest:refund:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  if p_approved and exists(select 1 from public.nest_refund_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation) then
    perform private.nest_record_refund(p_household,p_operation,p_payload,p_approval);
    return private.nest_read_refund_approval(p_household,p_approval);
  end if;
  -- Refund and correction writers lock the source BEFORE the household ledger.
  -- Never acquire the approval row first: execution consumes it after ledger work.
  if jsonb_typeof(p_payload->'sourceEventId') is distinct from 'string'
    or p_payload->>'sourceEventId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid refund source' using errcode='22023'; end if;
  perform 1 from public.financial_events where household_id=p_household and id=(p_payload->>'sourceEventId')::uuid for update;
  if not found then raise exception 'Refund source unavailable' using errcode='P0002'; end if;
  perform private.lock_household_ledger(p_household);
  v_row:=private.nest_owned_action(p_approval);
  if v_row.household_id is distinct from p_household or v_row.invocation_id is distinct from p_operation
    or v_row.command<>'expenses.refund' or v_row.command_version<>1 or v_row.payload is distinct from p_payload then
    raise exception 'Refund approval changed' using errcode='22023';
  end if;
  if not p_approved and v_row.status='denied' then return private.nest_read_refund_approval(p_household,p_approval); end if;
  perform private.nest_decide_action(p_approval,p_operation,'expenses.refund',1,p_payload,p_approved);
  if p_approved then perform private.nest_record_refund(p_household,p_operation,p_payload,p_approval); end if;
  return private.nest_read_refund_approval(p_household,p_approval);
end;
$$;
revoke all on function private.nest_decide_refund(uuid,uuid,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function private.nest_decide_refund(uuid,uuid,jsonb,uuid,boolean) to authenticated;
create function public.nest_decide_refund(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid,p_approved boolean)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_decide_refund($1,$2,$3,$4,$5);
$$;
revoke all on function public.nest_decide_refund(uuid,uuid,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.nest_decide_refund(uuid,uuid,jsonb,uuid,boolean) to authenticated;
