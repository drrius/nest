-- GATED summary discovery; raw candidate pagination advances past revoked sessions.
create index nest_summary_push_due on private.nest_daily_summary_outbox(summary_date,due_at,id) where state in ('pending','started');
create function private.nest_scan_summary_push_deliveries(p_due timestamptz default null,p_outbox uuid default null,p_installation uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_now timestamptz; v_row record; v_count integer:=0; v_delivery uuid;
  v_after jsonb:=null; v_deliveries jsonb:='[]'::jsonb;
begin
  if not ((p_due is null and p_outbox is null and p_installation is null)
    or (p_due is not null and isfinite(p_due) and p_outbox is not null and p_installation is not null)) then
    raise exception 'Invalid push scan cursor' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  v_now:=clock_timestamp();
  for v_row in select o.id,o.due_at,d.installation_id
    from private.nest_daily_summary_outbox o join private.nest_push_devices d
      on d.household_id=o.household_id and d.actor_id=o.recipient_id and d.token is not null
    where o.state in ('pending','started') and o.summary_date=(v_now at time zone 'Europe/Zurich')::date and o.due_at<=v_now
      and (p_due is null or (o.due_at,o.id,d.installation_id)>(p_due,p_outbox,p_installation))
    order by o.due_at,o.id,d.installation_id limit 100 loop
    v_count:=v_count+1;
    v_after:=jsonb_build_object('dueAt',v_row.due_at,'outboxId',v_row.id,'installationId',v_row.installation_id);
    v_delivery:=private.nest_prepare_summary_push(v_row.id,v_row.installation_id);
    if v_delivery is not null then v_deliveries:=v_deliveries||jsonb_build_array(v_delivery); end if;
  end loop;
  return jsonb_build_object('version',1,'scanned',v_count,'deliveries',v_deliveries,
    'after',case when v_count=100 then v_after else null end,'complete',v_count<100);
end;
$$;
revoke all on function private.nest_scan_summary_push_deliveries(timestamptz,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_scan_summary_push_deliveries(timestamptz,uuid,uuid) to service_role;
create function public.nest_scan_summary_push_deliveries(p_due timestamptz default null,p_outbox uuid default null,p_installation uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_scan_summary_push_deliveries($1,$2,$3);
$$;
revoke all on function public.nest_scan_summary_push_deliveries(timestamptz,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_scan_summary_push_deliveries(timestamptz,uuid,uuid) to service_role;
