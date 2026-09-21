-- GATED additive read only; no receipt paths or financial writers.
create function private.nest_money_detail(p_household uuid,p_event uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare e public.financial_events%rowtype; v_shares jsonb; v_category jsonb; v_reversal uuid;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select * into e from public.financial_events where household_id=p_household and id=p_event;
  if not found then raise exception 'Financial event unavailable' using errcode='P0002'; end if;
  if (select count(*) from public.household_members where household_id=p_household)<>2
    or (select count(*) from public.ledger_entries where household_id=p_household and financial_event_id=e.id)<>2
    or (select sum(receivable_delta_cents) from public.ledger_entries where household_id=p_household and financial_event_id=e.id)<>0 then
    raise exception 'Incomplete ledger projection' using errcode='22023';
  end if;
  if e.type='reversal' and (
    (select count(*) from public.ledger_entries where household_id=p_household and financial_event_id=e.related_event_id)<>2
    or exists(select 1 from public.ledger_entries r
      left join public.ledger_entries original on original.household_id=r.household_id
        and original.financial_event_id=e.related_event_id and original.member_id=r.member_id
      where r.household_id=p_household and r.financial_event_id=e.id
        and (original.id is null or r.receivable_delta_cents<>-original.receivable_delta_cents))
  ) then raise exception 'Invalid reversal projection' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('memberId',l.member_id,
    'deltaCentimes',l.receivable_delta_cents::text,'allocatedCentimes',a.allocated_cents::text) order by l.member_id)
    into v_shares from public.ledger_entries l left join public.financial_allocations a
      on a.household_id=l.household_id and a.financial_event_id=l.financial_event_id and a.member_id=l.member_id
    where l.household_id=p_household and l.financial_event_id=e.id;
  select jsonb_build_object('id',id,'name',name) into v_category from public.expense_categories
    where household_id=p_household and id=e.category_id;
  select id into v_reversal from public.financial_events
    where household_id=p_household and related_event_id=e.id and type='reversal';
  return jsonb_build_object('version',1,'householdId',p_household,'event',jsonb_build_object(
    'eventId',e.id,'kind',e.type,'occurredOn',e.occurred_on::text,
    'createdAt',case when isfinite(e.created_at) then
      to_char(e.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') ||
        case when extract(year from e.created_at at time zone 'UTC')<0 then ' BC' else '' end
      else e.created_at::text end,
    'occurredOrder',case when isfinite(e.occurred_on) then (e.occurred_on-date '2000-01-01')::text else e.occurred_on::text end,
    'createdOrder',case when isfinite(e.created_at) then (extract(epoch from e.created_at)*1000000)::numeric(30,0)::text else e.created_at::text end,
    'description',e.description,'amountCentimes',e.amount_cents::text,'createdBy',e.created_by_member_id,
    'payerId',e.payer_member_id,'relatedEventId',e.related_event_id,'hasReceipt',e.receipt_path is not null
  ),'note',e.note,'category',v_category,'reversedById',v_reversal,'shares',v_shares);
end;
$$;
revoke all on function private.nest_money_detail(uuid,uuid) from public,anon,authenticated;
grant execute on function private.nest_money_detail(uuid,uuid) to authenticated;
create function public.nest_money_detail(p_household uuid,p_event uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_money_detail($1,$2);
$$;
revoke all on function public.nest_money_detail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nest_money_detail(uuid,uuid) to authenticated;
