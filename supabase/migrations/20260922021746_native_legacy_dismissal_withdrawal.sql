-- GATED: explicit, serialized withdrawal; no automatic intent retirement.
create or replace function private.nest_decide_legacy_dismissal(p_household uuid,p_operation uuid,p_payload jsonb,p_approval uuid,p_approved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_row public.nest_action_approvals;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_approval is null or p_approved is null then
    raise exception 'Invalid dismissal decision' using errcode='22023'; end if;
  perform private.nest_legacy_dismiss_input(p_payload);
  perform pg_advisory_xact_lock(hashtextextended('nest:legacy-draft:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  if p_approved and exists(select 1 from private.nest_legacy_draft_operations
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation and result is not null) then
    perform private.nest_dismiss_legacy_draft(p_household,p_operation,p_payload,p_approval);
    return private.nest_read_legacy_dismissal_approval(p_household,p_approval);
  end if;
  -- Match execution lock order before touching the approval row.
  if p_approved then
    perform 1 from public.expense_drafts where household_id=p_household and id=(p_payload->>'draftId')::uuid for update;
    perform private.lock_household_ledger(p_household);
  end if;
  v_row:=private.nest_owned_action(p_approval);
  if v_row.household_id is distinct from p_household or v_row.invocation_id is distinct from p_operation
    or v_row.command<>'recurring.dismiss-legacy-draft' or v_row.command_version<>1 or v_row.payload is distinct from p_payload then
    raise exception 'Dismissal approval changed' using errcode='22023'; end if;
  if not p_approved then
    -- Explicit withdrawal fences delayed approvals even after expiry or a separate
    -- approval-only request. It cannot undo a dismissal that already committed.
    if v_row.status in ('pending','approved') then
      update public.nest_action_approvals set status='denied',decided_at=clock_timestamp() where id=p_approval;
    end if;
    return private.nest_read_legacy_dismissal_approval(p_household,p_approval);
  end if;
  perform private.nest_decide_action(p_approval,p_operation,'recurring.dismiss-legacy-draft',1,p_payload,p_approved);
  if p_approved then perform private.nest_dismiss_legacy_draft(p_household,p_operation,p_payload,p_approval); end if;
  return private.nest_read_legacy_dismissal_approval(p_household,p_approval);
end;
$$;
