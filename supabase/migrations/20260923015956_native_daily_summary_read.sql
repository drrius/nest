-- Recipient-only saved snapshots. Muting future delivery does not erase history.
create function private.nest_read_daily_summary(p_household uuid,p_summary uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_content jsonb;
begin
  if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=auth.uid() for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  select s.content into v_content from private.nest_daily_summary_snapshots s
    join private.nest_daily_summary_outbox o on o.id=s.outbox_id
    where o.id=p_summary and o.household_id=p_household and o.recipient_id=auth.uid() and o.state='started';
  if v_content is null then raise exception 'Summary unavailable' using errcode='P0002'; end if;
  return jsonb_build_object('version',1,'summaryId',p_summary,'summary',v_content);
end;
$$;
revoke all on function private.nest_read_daily_summary(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_daily_summary(uuid,uuid) to authenticated;
create function public.nest_read_daily_summary(p_household uuid,p_summary uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_read_daily_summary(p_household,p_summary);
$$;
revoke all on function public.nest_read_daily_summary(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_daily_summary(uuid,uuid) to authenticated;
