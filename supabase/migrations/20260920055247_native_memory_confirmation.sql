-- GATED additive candidate. Native confirmation/denial is never registered as an AI tool.
-- Approval and memory effects commit together, so a conflicting save leaves consent pending.
create function private.nest_decide_memory(
  p_household uuid,p_operation uuid,p_memory uuid,p_expected bigint,p_content text,p_approval uuid,p_approved boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_payload jsonb; v_row public.nest_action_approvals; v_receipt jsonb;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_approved is null or p_operation is null or p_memory is null or p_expected is null or p_expected<0
    or p_approval is null or not private.nest_valid_memory_content(p_content) then
    raise exception 'Invalid memory decision' using errcode='22023';
  end if;
  -- Same lock order as the native memory command: member, owner, approval.
  perform pg_advisory_xact_lock(hashtextextended('nest-memory:'||p_household::text||':'||v_actor::text,0));
  if p_approved and exists(select 1 from public.nest_memory_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation) then
    v_receipt:=private.nest_save_memory(p_household,p_operation,p_memory,p_expected,p_content,p_approval);
    return jsonb_build_object('status','consumed','receipt',v_receipt);
  end if;
  v_payload:=jsonb_build_object('memoryId',p_memory,'expectedRevision',p_expected::text,'content',p_content);
  v_row:=private.nest_owned_action(p_approval);
  if v_row.household_id is distinct from p_household or v_row.invocation_id is distinct from p_operation
    or v_row.command<>'memory.save' or v_row.command_version<>1 or v_row.payload is distinct from v_payload then
    raise exception 'Memory approval changed' using errcode='22023';
  end if;
  if not p_approved and v_row.status='denied' then return jsonb_build_object('status','denied'); end if;
  perform private.nest_decide_action(p_approval,p_operation,'memory.save',1,v_payload,p_approved);
  if not p_approved then return jsonb_build_object('status','denied'); end if;
  v_receipt:=private.nest_save_memory(p_household,p_operation,p_memory,p_expected,p_content,p_approval);
  return jsonb_build_object('status','consumed','receipt',v_receipt);
exception when sqlstate '55000' then
  raise exception 'Memory approval changed or expired' using errcode='40001';
end;
$$;
revoke all on function private.nest_decide_memory(uuid,uuid,uuid,bigint,text,uuid,boolean) from public,anon,authenticated;
grant execute on function private.nest_decide_memory(uuid,uuid,uuid,bigint,text,uuid,boolean) to authenticated;
create function public.nest_decide_memory(
  p_household uuid,p_operation uuid,p_memory uuid,p_expected bigint,p_content text,p_approval uuid,p_approved boolean
) returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_decide_memory($1,$2,$3,$4,$5,$6,$7);
$$;
revoke all on function public.nest_decide_memory(uuid,uuid,uuid,bigint,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.nest_decide_memory(uuid,uuid,uuid,bigint,text,uuid,boolean) to authenticated;
