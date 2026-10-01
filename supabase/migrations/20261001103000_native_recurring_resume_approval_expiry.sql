-- GATED: owner-only expiry attestation; no decision or ledger mutation.
-- The approval lock waits for any in-flight decision/consumption transaction.
-- Never acquire a ledger/source lock after it: financial writers take those first.
create or replace function public.nest_financial_approval_expiry(
  p_household uuid, p_approval uuid, p_operation uuid, p_command text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.nest_action_approvals; v_now timestamptz;
begin
  v_row := private.nest_owned_action(p_approval);
  if v_row.household_id is distinct from p_household
    or v_row.invocation_id is distinct from p_operation
    or v_row.command is distinct from p_command
    or v_row.command_version <> 1
    or p_command not in ('expenses.record','expenses.refund','expenses.correct','settlements.record','recurring.create','recurring.update','recurring.pause','recurring.cancel','recurring.resume') then
    raise exception 'Approval identity changed' using errcode='22023';
  end if;
  v_now := clock_timestamp();
  return jsonb_build_object('version',1,'actorId',auth.uid(),'householdId',p_household,
    'approvalId',v_row.id,'operationId',v_row.invocation_id,'command',v_row.command,
    'expiredUnused',v_row.status in ('pending','approved') and v_row.expires_at <= v_now,
    'checkedAt',to_char(v_now at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
end;
$$;
revoke all on function public.nest_financial_approval_expiry(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.nest_financial_approval_expiry(uuid,uuid,uuid,text) to authenticated;
