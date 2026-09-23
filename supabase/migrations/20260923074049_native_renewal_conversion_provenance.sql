-- GATED: no conversion occurs when this migration is installed.
create table private.nest_renewal_conversions (
  household_id uuid not null,
  legacy_id uuid not null,
  actor_id uuid not null,
  operation_id uuid not null,
  source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  converted_at timestamptz not null default clock_timestamp(),
  primary key(household_id,legacy_id),
  unique(actor_id,household_id,operation_id),
  foreign key(household_id,legacy_id) references public.household_commitments(household_id,id),
  foreign key(household_id,legacy_id) references public.nest_renewals(household_id,id),
  foreign key(actor_id,household_id,operation_id) references private.nest_renewal_operations(actor_id,household_id,operation_id)
);
alter table private.nest_renewal_conversions enable row level security;
revoke all on private.nest_renewal_conversions from public,anon,authenticated,service_role;
create trigger nest_renewal_conversions_immutable before update or delete on private.nest_renewal_conversions
  for each row execute function private.reject_financial_history_change();

create function public.nest_convert_legacy_renewal(p_household uuid,p_legacy uuid,p_operation uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_source public.household_commitments;
  v_prior private.nest_renewal_conversions; v_result jsonb;
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
  if v_source.archived_at is not null or v_source.status<>'active' or v_source.renewal_on is null
    or v_source.recurring_expense_rule_id is not null then
    raise exception 'Commitment requires separate migration review' using errcode='22023'; end if;
  v_result:=public.nest_save_renewal(p_household,p_operation,jsonb_build_object(
    'renewalId',v_source.id,'expectedRevision',null,'fields',jsonb_build_object(
      'title',v_source.title,'renewalOn',v_source.renewal_on::text,'noticeDays',v_source.notice_days,
      'responsibleId',v_source.responsible_member_id,'recurringRuleId',null)));
  insert into private.nest_renewal_conversions(household_id,legacy_id,actor_id,operation_id,source_hash,result)
    values(p_household,p_legacy,v_actor,p_operation,p_hash,v_result);
  return v_result;
end;
$$;
revoke all on function public.nest_convert_legacy_renewal(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.nest_convert_legacy_renewal(uuid,uuid,uuid,text) to authenticated;
