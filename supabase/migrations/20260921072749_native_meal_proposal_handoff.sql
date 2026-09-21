-- GATED additive candidate. Recover the original request identity for an owner-only handoff.
-- Generation reservations alone have this top-level field; edit/approval/discard receipts do not.
create unique index nest_meal_proposal_origin on private.nest_meal_proposal_receipts
  (actor_id,household_id,(result->>'proposalId')) where result ? 'expectedWeekRevision';

create function private.nest_open_meal_proposal(p_household uuid,p_proposal uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_proposal private.nest_meal_proposals; v_receipt jsonb;
begin
  -- Authorization and serialization precede receipt lookup, including historical handoffs.
  v_proposal:=private.nest_expire_proposal(private.nest_lock_proposal_worker(auth.uid(),p_household,p_proposal));
  select result into v_receipt from private.nest_meal_proposal_receipts
    where actor_id=auth.uid() and household_id=p_household and result->>'proposalId'=p_proposal::text
      and result ? 'expectedWeekRevision';
  if not found then raise exception 'Proposal origin unavailable' using errcode='40001'; end if;
  return jsonb_build_object('version',1,'receipt',v_receipt,'envelope',private.nest_proposal_owner_result(v_proposal));
end;
$$;
revoke all on function private.nest_open_meal_proposal(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_open_meal_proposal(uuid,uuid) to authenticated;
create function public.nest_open_meal_proposal(p_household uuid,p_proposal uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_open_meal_proposal($1,$2); $$;
revoke all on function public.nest_open_meal_proposal(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_open_meal_proposal(uuid,uuid) to authenticated;
