-- GATED additive candidate: apply only to disposable fixtures until migration approval.
-- STABLE keeps roster, integrity checks and all-history sums in one statement snapshot.
create function private.nest_money_balance(p_household uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_members jsonb; v_count bigint; v_opening boolean;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if (select count(*) from public.household_members where household_id=p_household) <> 2 then
    raise exception 'Money requires two household members' using errcode='22023';
  end if;
  if exists (
    select e.id from public.financial_events e
    left join public.ledger_entries l on l.financial_event_id=e.id and l.household_id=e.household_id
    where e.household_id=p_household
    group by e.id
    having count(l.id)<>2 or sum(l.receivable_delta_cents)<>0
  ) then
    raise exception 'Incomplete or unbalanced ledger' using errcode='22023';
  end if;
  select count(*),coalesce(bool_or(type='opening_balance'),false)
    into v_count,v_opening from public.financial_events where household_id=p_household;
  select jsonb_agg(jsonb_build_object('actorId',m.user_id,'displayName',m.display_name,
    'centimes',coalesce(b.total,0)::text) order by m.user_id) into v_members
  from public.household_members m
  left join (
    select member_id,sum(receivable_delta_cents) as total from public.ledger_entries
    where household_id=p_household group by member_id
  ) b on b.member_id=m.user_id
  where m.household_id=p_household;
  return jsonb_build_object('version',1,'householdId',p_household,'eventCount',v_count::text,
    'openingEstablished',v_opening,'members',v_members);
end;
$$;
revoke all on function private.nest_money_balance(uuid) from public,anon,authenticated;
grant execute on function private.nest_money_balance(uuid) to authenticated;
create function public.nest_money_balance(p_household uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_money_balance($1);
$$;
revoke all on function public.nest_money_balance(uuid) from public,anon,authenticated;
grant execute on function public.nest_money_balance(uuid) to authenticated;
