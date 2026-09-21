-- GATED: authorized read-only eligibility; each mutation rechecks the source under locks.
create function private.nest_correction_context(p_household uuid,p_source uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_source jsonb; v_kind text; v_refunds boolean; v_successor boolean; v_unreversed boolean; v_clear boolean;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  v_source:=private.nest_money_detail(p_household,p_source);
  v_kind:=v_source->'event'->>'kind';
  v_unreversed:=v_source->>'reversedById' is null;
  select exists(select 1 from public.financial_events f where f.household_id=p_household
    and f.related_event_id=p_source and f.type='refund' and not exists(
      select 1 from public.financial_events r where r.household_id=p_household and r.related_event_id=f.id and r.type='reversal'
    )) into v_refunds;
  select exists(select 1 from public.financial_events f where f.household_id=p_household
    and f.related_event_id=p_source and f.type='opening_balance') into v_successor;
  v_clear:=not v_refunds and not v_successor;
  return jsonb_build_object('version',1,'householdId',p_household,'source',v_source,
    'hasActiveRefunds',v_refunds,'hasOpeningSuccessor',v_successor,
    'canReverse',v_kind<>'reversal' and v_unreversed and v_clear,
    'canReplace',v_clear and ((v_kind in ('expense','replacement') and v_unreversed) or v_kind='opening_balance'));
end;
$$;
revoke all on function private.nest_correction_context(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_correction_context(uuid,uuid) to authenticated;
create function public.nest_correction_context(p_household uuid,p_source uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_correction_context($1,$2);
$$;
revoke all on function public.nest_correction_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_correction_context(uuid,uuid) to authenticated;
