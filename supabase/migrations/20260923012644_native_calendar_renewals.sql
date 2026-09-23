-- App-only projection. No EventKit write, ledger change or reminder dispatch.
create index nest_renewals_calendar_date on public.nest_renewals(household_id,renewal_on,id) where not removed;
create index nest_renewals_calendar_deadline on public.nest_renewals(household_id,(renewal_on-notice_days),id) where not removed;
create function public.nest_calendar_renewals(p_household uuid,p_date date,p_after uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb; v_next uuid;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if auth.uid() is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_date is null or p_date not between date '0001-01-01' and date '9999-12-31' then
    raise exception 'Invalid calendar date' using errcode='22023'; end if;
  select coalesce(jsonb_agg(private.nest_renewal_json(r) order by r.id),'[]'::jsonb) into v_rows
    from (select * from public.nest_renewals where household_id=p_household and not removed
      and (renewal_on=p_date or renewal_on-notice_days=p_date)
      and (p_after is null or id>p_after) order by id limit 51) r;
  if jsonb_array_length(v_rows)>50 then
    v_rows:=v_rows-50; v_next:=(v_rows->49->>'renewalId')::uuid;
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,'date',to_char(p_date,'YYYY-MM-DD'),
    'after',p_after,'next',v_next,'renewals',v_rows);
end;
$$;
revoke all on function public.nest_calendar_renewals(uuid,date,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_calendar_renewals(uuid,date,uuid) to authenticated;
