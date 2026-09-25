-- GATED additive reader. Deployment remains separate from source merge.
-- A stable snapshot pairs the original reservation with current owner-visible state.
-- It neither locks work nor expires a job; the existing recovery command does that.
create function private.nest_read_meal_proposal_origin(p_household uuid,p_proposal uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_envelope jsonb; v_receipt jsonb;
begin
  v_envelope:=private.nest_read_meal_proposal(p_household,p_proposal);
  select result into v_receipt from private.nest_meal_proposal_receipts
    where actor_id=auth.uid() and household_id=p_household
      and result->>'proposalId'=p_proposal::text and result ? 'expectedWeekRevision';
  if not found then raise exception 'Proposal origin unavailable' using errcode='40001'; end if;
  return jsonb_build_object('version',1,'receipt',v_receipt,'envelope',v_envelope);
end;
$$;
revoke all on function private.nest_read_meal_proposal_origin(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_meal_proposal_origin(uuid,uuid) to authenticated;
create function public.nest_read_meal_proposal_origin(p_household uuid,p_proposal uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_read_meal_proposal_origin($1,$2);
$$;
revoke all on function public.nest_read_meal_proposal_origin(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_meal_proposal_origin(uuid,uuid) to authenticated;
