-- GATED additive reader. Deployment remains separate from source merge.
-- Read completed results without expiring pending jobs or acquiring write locks.
create function private.nest_read_proposal_edit_snapshot(p_household uuid,p_operation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_job private.nest_meal_proposal_edits;
begin
  if v_actor is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_job from private.nest_meal_proposal_edits
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if not found then raise exception 'Proposal edit changed' using errcode='40001'; end if;
  perform private.nest_read_meal_proposal(p_household,v_job.proposal_id);
  return private.nest_proposal_edit_json(v_job);
end;
$$;
revoke all on function private.nest_read_proposal_edit_snapshot(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_proposal_edit_snapshot(uuid,uuid) to authenticated;
create function public.nest_read_proposal_edit_snapshot(p_household uuid,p_operation uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_read_proposal_edit_snapshot($1,$2);
$$;
revoke all on function public.nest_read_proposal_edit_snapshot(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_proposal_edit_snapshot(uuid,uuid) to authenticated;
