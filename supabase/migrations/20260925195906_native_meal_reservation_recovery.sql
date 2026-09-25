-- GATED additive reader; no reservation, expiry or model execution occurs here.
create function private.nest_read_meal_reservation(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_prior private.nest_meal_proposal_receipts; v_hash bytea;
begin
  if v_actor is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid proposal operation' using errcode='22023'; end if;
  perform private.nest_meal_proposal_input(p_input,false);
  select * into v_prior from private.nest_meal_proposal_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if not found then return null; end if;
  -- Match the existing reservation protocol, including collisions with other proposal commands.
  v_hash:=sha256(convert_to(jsonb_build_object('action','begin','input',p_input)::text,'UTF8'));
  if v_prior.request_hash<>v_hash then raise exception 'Proposal operation changed' using errcode='22023'; end if;
  return v_prior.result;
end;
$$;
revoke all on function private.nest_read_meal_reservation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_meal_reservation(uuid,uuid,jsonb) to authenticated;
create function public.nest_read_meal_reservation(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_read_meal_reservation($1,$2,$3);
$$;
revoke all on function public.nest_read_meal_reservation(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_meal_reservation(uuid,uuid,jsonb) to authenticated;
