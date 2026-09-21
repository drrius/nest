-- GATED: durable correction proposal reads and atomic native confirmation.
-- Confirmation/denial is never registered as an AI tool.
create function private.nest_read_correction_approval(p_household uuid,p_approval uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select jsonb_build_object('version',1,'actorId',a.actor_id,'householdId',a.household_id,'approval',
    jsonb_build_object('id',a.id,'operationId',a.invocation_id,'correction',a.payload,'status',a.status,
      'expiresAt',to_char(timezone('UTC',a.expires_at),'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'receipt',r.result)) into v_result
    from public.nest_action_approvals a left join public.nest_correction_receipts r
      on r.actor_id=a.actor_id and r.household_id=a.household_id and r.operation_id=a.invocation_id
        and r.result->>'approvalId'=a.id::text
    where a.id=p_approval and a.household_id=p_household and a.actor_id=auth.uid()
      and a.command='expenses.correct' and a.command_version=1;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  return v_result;
end;
$$;
revoke all on function private.nest_read_correction_approval(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_read_correction_approval(uuid,uuid) to authenticated;
create function public.nest_read_correction_approval(p_household uuid,p_approval uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_read_correction_approval($1,$2);
$$;
revoke all on function public.nest_read_correction_approval(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_read_correction_approval(uuid,uuid) to authenticated;

create function private.nest_decide_correction(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid,p_approved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row public.nest_action_approvals; v_source public.financial_events; v_source_id uuid;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_approval is null or p_approved is null or p_payload is null or octet_length(p_payload::text)>32768 then
    raise exception 'Invalid correction decision' using errcode='22023';
  end if;
  -- Serialize decisions with execution; historical receipts do not revalidate current source state.
  perform pg_advisory_xact_lock(hashtextextended('nest:correction:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  if p_approved and exists(select 1 from public.nest_correction_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation) then
    perform private.nest_record_correction(p_household,p_operation,p_payload,p_approval);
    return private.nest_read_correction_approval(p_household,p_approval);
  end if;
  -- Correction writers lock parent, source, household ledger, then approval.
  -- Never acquire the approval row first: execution consumes it after ledger work.
  v_source_id:=private.nest_correction_identity(p_payload);
  select * into v_source from public.financial_events where household_id=p_household and id=v_source_id;
  if not found then raise exception 'Correction source unavailable' using errcode='P0002'; end if;
  -- Reversing a refund must lock its parent before the refund row, like the audited engine.
  if v_source.type='refund' then
    perform 1 from public.financial_events where household_id=p_household and id=v_source.related_event_id for update;
  end if;
  perform 1 from public.financial_events where household_id=p_household and id=v_source_id for update;
  perform private.lock_household_ledger(p_household);
  v_row:=private.nest_owned_action(p_approval);
  if v_row.household_id is distinct from p_household or v_row.invocation_id is distinct from p_operation
    or v_row.command<>'expenses.correct' or v_row.command_version<>1 or v_row.payload is distinct from p_payload then
    raise exception 'Correction approval changed' using errcode='22023';
  end if;
  if not p_approved and v_row.status='denied' then return private.nest_read_correction_approval(p_household,p_approval); end if;
  perform private.nest_decide_action(p_approval,p_operation,'expenses.correct',1,p_payload,p_approved);
  if p_approved then perform private.nest_record_correction(p_household,p_operation,p_payload,p_approval); end if;
  return private.nest_read_correction_approval(p_household,p_approval);
end;
$$;
revoke all on function private.nest_decide_correction(uuid,uuid,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function private.nest_decide_correction(uuid,uuid,jsonb,uuid,boolean) to authenticated;
create function public.nest_decide_correction(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid,p_approved boolean)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_decide_correction($1,$2,$3,$4,$5);
$$;
revoke all on function public.nest_decide_correction(uuid,uuid,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.nest_decide_correction(uuid,uuid,jsonb,uuid,boolean) to authenticated;
