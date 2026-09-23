-- GATED server-only grocery discovery, checkpoint and maintenance; no hosted job.
create function private.nest_scan_grocery_push_deliveries(p_due timestamptz default null,p_outbox uuid default null,p_installation uuid default null)
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
    from private.nest_grocery_reminder_outbox o join private.nest_push_devices d
      on d.household_id=o.household_id and d.actor_id=o.recipient_id and d.token is not null
    where o.state='pending' and o.due_at>v_now-interval '1 day' and o.due_at<=v_now
      and (p_due is null or (o.due_at,o.id,d.installation_id)>(p_due,p_outbox,p_installation))
    order by o.due_at,o.id,d.installation_id limit 100 loop
    v_count:=v_count+1;
    v_after:=jsonb_build_object('dueAt',v_row.due_at,'outboxId',v_row.id,'installationId',v_row.installation_id);
    v_delivery:=private.nest_prepare_grocery_push(v_row.id,v_row.installation_id);
    if v_delivery is not null then v_deliveries:=v_deliveries||jsonb_build_array(v_delivery); end if;
  end loop;
  return jsonb_build_object('version',1,'scanned',v_count,'deliveries',v_deliveries,
    'after',case when v_count=100 then v_after else null end,'complete',v_count<100);
end;
$$;
revoke all on function private.nest_scan_grocery_push_deliveries(timestamptz,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_scan_grocery_push_deliveries(timestamptz,uuid,uuid) to service_role;
create function public.nest_scan_grocery_push_deliveries(p_due timestamptz default null,p_outbox uuid default null,p_installation uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_scan_grocery_push_deliveries($1,$2,$3);
$$;
revoke all on function public.nest_scan_grocery_push_deliveries(timestamptz,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_scan_grocery_push_deliveries(timestamptz,uuid,uuid) to service_role;
-- Gated server-only progress. No timer or provider dispatch is activated.
create table private.nest_grocery_push_scan_checkpoint (
  singleton boolean primary key default true check(singleton),
  revision uuid not null default gen_random_uuid(),
  cursor jsonb
);
insert into private.nest_grocery_push_scan_checkpoint(singleton) values(true);
alter table private.nest_grocery_push_scan_checkpoint enable row level security;
revoke all on private.nest_grocery_push_scan_checkpoint from public,anon,authenticated,service_role;

create function private.nest_read_grocery_push_checkpoint()
returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('version',1,'revision',revision,'after',cursor)
    from private.nest_grocery_push_scan_checkpoint where singleton;
$$;
revoke all on function private.nest_read_grocery_push_checkpoint() from public,anon,authenticated,service_role;
grant execute on function private.nest_read_grocery_push_checkpoint() to service_role;
create function public.nest_read_grocery_push_checkpoint()
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_read_grocery_push_checkpoint(); $$;
revoke all on function public.nest_read_grocery_push_checkpoint() from public,anon,authenticated,service_role;
grant execute on function public.nest_read_grocery_push_checkpoint() to service_role;

create function private.nest_save_grocery_push_checkpoint(p_revision uuid,p_after jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row private.nest_grocery_push_scan_checkpoint; v_due timestamptz; v_cursor jsonb:=null;
begin
  if p_revision is null then raise exception 'Missing checkpoint revision' using errcode='22023'; end if;
  if p_after is not null and p_after<>'null'::jsonb then
    if jsonb_typeof(p_after) is distinct from 'object' or octet_length(p_after::text)>1024
      or not(p_after ?& array['dueAt','outboxId','installationId'])
      or p_after-array['dueAt','outboxId','installationId']<>'{}'::jsonb
      or jsonb_typeof(p_after->'dueAt') is distinct from 'string' then
      raise exception 'Invalid checkpoint cursor' using errcode='22023'; end if;
    v_due:=(p_after->>'dueAt')::timestamptz;
    if not isfinite(v_due) then raise exception 'Invalid checkpoint instant' using errcode='22023'; end if;
    v_cursor:=jsonb_build_object('dueAt',v_due,
      'outboxId',private.nest_expense_uuid(p_after->'outboxId',false),
      'installationId',private.nest_expense_uuid(p_after->'installationId',false));
  end if;
  select * into strict v_row from private.nest_grocery_push_scan_checkpoint where singleton for update;
  if v_row.revision<>p_revision then raise exception 'Checkpoint advanced' using errcode='40001'; end if;
  update private.nest_grocery_push_scan_checkpoint set revision=gen_random_uuid(),cursor=v_cursor where singleton;
  return private.nest_read_grocery_push_checkpoint();
end;
$$;
revoke all on function private.nest_save_grocery_push_checkpoint(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_save_grocery_push_checkpoint(uuid,jsonb) to service_role;
create function public.nest_save_grocery_push_checkpoint(p_revision uuid,p_after jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_save_grocery_push_checkpoint($1,$2); $$;
revoke all on function public.nest_save_grocery_push_checkpoint(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_grocery_push_checkpoint(uuid,jsonb) to service_role;

-- Fixed UTC windows keep bounded materialization cursors stable across invocations.
-- Shared attempt expiry/retries remain handled by the common delivery maintenance.
create function private.nest_maintain_grocery_reminders()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_today timestamptz; v_previous jsonb; v_current jsonb; v_cancelled jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  v_today:=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  v_previous:=private.nest_materialize_grocery_reminders(v_today-interval '24 hours',v_today);
  v_current:=private.nest_materialize_grocery_reminders(v_today,v_today+interval '24 hours');
  v_cancelled:=private.nest_cancel_obsolete_grocery_reminders();
  return jsonb_build_object('version',1,'previous',v_previous,'current',v_current,'obsolete',v_cancelled);
end;
$$;
revoke all on function private.nest_maintain_grocery_reminders() from public,anon,authenticated,service_role;
grant execute on function private.nest_maintain_grocery_reminders() to service_role;
create function public.nest_maintain_grocery_reminders()
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_maintain_grocery_reminders(); $$;
revoke all on function public.nest_maintain_grocery_reminders() from public,anon,authenticated,service_role;
grant execute on function public.nest_maintain_grocery_reminders() to service_role;
