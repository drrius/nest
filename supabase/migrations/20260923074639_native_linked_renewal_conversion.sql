-- GATED: links only an existing explicit adoption; creates no mandate.
create or replace function public.nest_convert_legacy_renewal(p_household uuid,p_legacy uuid,p_operation uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_source public.household_commitments;
  v_prior private.nest_renewal_conversions; v_result jsonb; v_native_rule uuid;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_legacy is null or p_operation is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid reviewed conversion identity' using errcode='22023'; end if;
  select * into v_source from public.household_commitments where household_id=p_household and id=p_legacy for update;
  if not found then raise exception 'Reviewed commitment changed' using errcode='40001'; end if;
  select * into v_prior from private.nest_renewal_conversions where household_id=p_household and legacy_id=p_legacy;
  if found then
    if v_prior.actor_id<>v_actor or v_prior.operation_id<>p_operation or v_prior.source_hash<>p_hash then
      raise exception 'Renewal changed' using errcode='40001'; end if;
    return v_prior.result;
  end if;
  if encode(sha256(convert_to(to_jsonb(v_source)::text,'UTF8')),'hex')<>p_hash then
    raise exception 'Reviewed commitment changed' using errcode='40001'; end if;
  if v_source.archived_at is not null or v_source.status<>'active' or v_source.renewal_on is null then
    raise exception 'Commitment requires separate migration review' using errcode='22023'; end if;
  if v_source.recurring_expense_rule_id is not null then
    select native_rule_id into v_native_rule from private.nest_legacy_recurring_adoptions
      where household_id=p_household and legacy_rule_id=v_source.recurring_expense_rule_id;
    if not found then raise exception 'Commitment requires separate migration review' using errcode='22023'; end if;
  end if;
  v_result:=public.nest_save_renewal(p_household,p_operation,jsonb_build_object(
    'renewalId',v_source.id,'expectedRevision',null,'fields',jsonb_build_object(
      'title',v_source.title,'renewalOn',v_source.renewal_on::text,'noticeDays',v_source.notice_days,
      'responsibleId',v_source.responsible_member_id,'recurringRuleId',v_native_rule)));
  insert into private.nest_renewal_conversions(household_id,legacy_id,actor_id,operation_id,source_hash,result)
    values(p_household,p_legacy,v_actor,p_operation,p_hash,v_result);
  return v_result;
end;
$$;
revoke all on function public.nest_convert_legacy_renewal(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.nest_convert_legacy_renewal(uuid,uuid,uuid,text) to authenticated;
