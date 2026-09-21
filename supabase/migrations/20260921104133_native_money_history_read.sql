-- GATED additive read only. Preserve every historical event, including corrected originals.
create function private.nest_money_history(p_household uuid,p_before uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_anchor public.financial_events%rowtype; v_events jsonb; v_next uuid;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_before is not null then
    select * into v_anchor from public.financial_events
      where household_id=p_household and id=p_before;
    if not found then raise exception 'History cursor unavailable' using errcode='P0002'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventId',e.id,'kind',e.type,'occurredOn',e.occurred_on::text,
    'createdAt',to_char(e.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'description',e.description,'amountCentimes',e.amount_cents::text,
    'createdBy',e.created_by_member_id,'payerId',e.payer_member_id,
    'relatedEventId',e.related_event_id,'hasReceipt',e.receipt_path is not null
  ) order by e.occurred_on desc,e.created_at desc,e.id desc),'[]'::jsonb)
  into v_events from (
    select * from public.financial_events
    where household_id=p_household and (p_before is null or
      (occurred_on,created_at,id)<(v_anchor.occurred_on,v_anchor.created_at,v_anchor.id))
    order by occurred_on desc,created_at desc,id desc limit 51
  ) e;
  if jsonb_array_length(v_events)=51 then
    v_events:=v_events-50;
    v_next:=(v_events->49->>'eventId')::uuid;
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,
    'before',p_before,'events',v_events,'next',v_next);
end;
$$;
revoke all on function private.nest_money_history(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_money_history(uuid,uuid) to authenticated;
create function public.nest_money_history(p_household uuid,p_before uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_money_history($1,$2);
$$;
revoke all on function public.nest_money_history(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_money_history(uuid,uuid) to authenticated;
