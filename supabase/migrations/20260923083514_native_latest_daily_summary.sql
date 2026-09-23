-- GATED recipient-only discovery. Reads saved content; never generates or sends a summary.
create function private.nest_read_latest_daily_summary(p_household uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_latest jsonb;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select o.id into v_id from private.nest_daily_summary_outbox o
    join private.nest_daily_summary_snapshots s on s.outbox_id=o.id
    where o.household_id=p_household and o.recipient_id=auth.uid() and o.state='started'
      and o.summary_date<=(statement_timestamp() at time zone 'Europe/Zurich')::date
    order by o.summary_date desc limit 1;
  if v_id is not null then v_latest:=private.nest_read_daily_summary(p_household,v_id); end if;
  return jsonb_build_object('version',1,'householdId',p_household,'recipientId',auth.uid(),'latest',v_latest);
end;
$$;
revoke all on function private.nest_read_latest_daily_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_latest_daily_summary(uuid) to authenticated;
create function public.nest_read_latest_daily_summary(p_household uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_read_latest_daily_summary(p_household);
$$;
revoke all on function public.nest_read_latest_daily_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_latest_daily_summary(uuid) to authenticated;
