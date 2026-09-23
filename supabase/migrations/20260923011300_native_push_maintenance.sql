-- Gated maintenance entry point. No scheduler or external request is installed.
-- A persistent cursor visits all rejected rows, including permanently ineligible ones.
create table private.nest_push_retry_scan (
  singleton boolean primary key default true check(singleton),
  after_id uuid not null default '00000000-0000-0000-0000-000000000000'
);
insert into private.nest_push_retry_scan(singleton) values(true);
alter table private.nest_push_retry_scan enable row level security;
revoke all on private.nest_push_retry_scan from public,anon,authenticated,service_role;
create index nest_push_rejected_scan on private.nest_push_deliveries(id) where state='rejected';
create function private.nest_requeue_push_rejections()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_after uuid; v_id uuid; v_scanned integer:=0; v_requeued integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select after_id into strict v_after from private.nest_push_retry_scan where singleton for update;
  for v_id in select id from private.nest_push_deliveries where state='rejected' and id>v_after
    order by id limit 100 loop
    v_scanned:=v_scanned+1; v_after:=v_id;
    if private.nest_retry_push_delivery(v_id) then v_requeued:=v_requeued+1; end if;
  end loop;
  update private.nest_push_retry_scan set after_id=case when v_scanned<100
    then '00000000-0000-0000-0000-000000000000'::uuid else v_after end where singleton;
  return jsonb_build_object('scanned',v_scanned,'requeued',v_requeued,'wrapped',v_scanned<100);
end;
$$;
revoke all on function private.nest_requeue_push_rejections() from public,anon,authenticated,service_role;

create function private.nest_maintain_push_deliveries()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_today timestamptz; v_previous jsonb; v_current jsonb; v_cancelled jsonb; v_expired integer; v_retries jsonb;
begin
  -- Fixed UTC-day windows preserve source cursors across invocations. Both days
  -- cover every due instant still inside the delivery authorization's 24h window.
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  v_today:=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  v_previous:=private.nest_materialize_renewal_reminders(v_today-interval '24 hours',v_today);
  v_current:=private.nest_materialize_renewal_reminders(v_today,v_today+interval '24 hours');
  v_cancelled:=private.nest_cancel_obsolete_renewal_reminders();
  v_expired:=private.nest_expire_push_sends();
  v_retries:=private.nest_requeue_push_rejections();
  return jsonb_build_object('version',1,'previous',v_previous,'current',v_current,
    'obsolete',v_cancelled,'expired',v_expired,'retries',v_retries);
end;
$$;
revoke all on function private.nest_maintain_push_deliveries() from public,anon,authenticated,service_role;
grant execute on function private.nest_maintain_push_deliveries() to service_role;
create function public.nest_maintain_push_deliveries()
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_maintain_push_deliveries(); $$;
revoke all on function public.nest_maintain_push_deliveries() from public,anon,authenticated,service_role;
grant execute on function public.nest_maintain_push_deliveries() to service_role;
