-- GATED summary source on the existing delivery/attempt/receipt journal.
alter table private.nest_push_deliveries
  alter column outbox_id drop not null,
  add column summary_id uuid references private.nest_daily_summary_outbox(id),
  add constraint nest_push_exactly_one_source check((outbox_id is null)<>(summary_id is null)),
  add constraint nest_push_summary_installation unique(summary_id,installation_id);

create function private.nest_summary_push_current(p_summary private.nest_daily_summary_outbox,p_device private.nest_push_devices)
returns boolean language sql volatile security definer set search_path='' as $$
  select p_summary.state='started' and p_summary.due_at<=clock_timestamp()
    and p_summary.summary_date=(clock_timestamp() at time zone 'Europe/Zurich')::date
    and p_device.token is not null and p_device.household_id=p_summary.household_id and p_device.actor_id=p_summary.recipient_id
    and exists(select 1 from private.nest_daily_summary_snapshots s where s.outbox_id=p_summary.id)
    and exists(select 1 from public.household_members m join public.nest_notification_preferences p
      on p.household_id=m.household_id and p.actor_id=m.user_id
      where m.household_id=p_summary.household_id and m.user_id=p_summary.recipient_id and p.daily_summary_enabled
        and (p_summary.summary_date+p.daily_summary_time::time) at time zone 'Europe/Zurich'=p_summary.due_at)
    and exists(select 1 from auth.sessions s where s.id=p_device.session_id and s.user_id=p_device.actor_id
      and (s.not_after is null or s.not_after>clock_timestamp()))
    and not exists(select 1 from private.nest_push_revoked_sessions r
      where r.actor_id=p_device.actor_id and r.session_id=p_device.session_id);
$$;
revoke all on function private.nest_summary_push_current(private.nest_daily_summary_outbox,private.nest_push_devices) from public,anon,authenticated,service_role;

create function private.nest_prepare_summary_push(p_summary uuid,p_installation uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_summary private.nest_daily_summary_outbox; v_device private.nest_push_devices; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  if private.nest_start_daily_summary(p_summary) is null then return null; end if;
  select * into v_summary from private.nest_daily_summary_outbox where id=p_summary for share;
  select * into v_device from private.nest_push_devices where installation_id=p_installation for share;
  if not coalesce(private.nest_summary_push_current(v_summary,v_device),false) then return null; end if;
  insert into private.nest_push_deliveries(summary_id,installation_id,registration_revision)
    values(p_summary,p_installation,v_device.revision)
    on conflict(summary_id,installation_id) do update set registration_revision=excluded.registration_revision,state='ready'
      where private.nest_push_deliveries.state in ('ready','cancelled') and private.nest_push_deliveries.attempt_id is null
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.nest_prepare_summary_push(uuid,uuid) from public,anon,authenticated,service_role;

alter function private.nest_begin_push_delivery_once(uuid) rename to nest_begin_renewal_push_once;
create function private.nest_begin_push_delivery_once(p_delivery uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_delivery private.nest_push_deliveries; v_summary private.nest_daily_summary_outbox;
  v_device private.nest_push_devices; v_attempt uuid:=gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_delivery from private.nest_push_deliveries where id=p_delivery for update;
  if v_delivery.id is null or v_delivery.state<>'ready' then return null; end if;
  if v_delivery.summary_id is null then return private.nest_begin_renewal_push_once(p_delivery); end if;
  select * into strict v_summary from private.nest_daily_summary_outbox where id=v_delivery.summary_id;
  perform pg_advisory_xact_lock(hashtextextended('nest-notification-preferences:'||v_summary.household_id::text||':'||v_summary.recipient_id::text,0));
  perform 1 from public.household_members where household_id=v_summary.household_id and user_id=v_summary.recipient_id for share;
  perform 1 from public.nest_notification_preferences where household_id=v_summary.household_id and actor_id=v_summary.recipient_id for share;
  select * into strict v_summary from private.nest_daily_summary_outbox where id=v_delivery.summary_id for share;
  select * into v_device from private.nest_push_devices where installation_id=v_delivery.installation_id for share;
  perform 1 from auth.sessions where id=v_device.session_id for share;
  if v_device.revision is distinct from v_delivery.registration_revision
    or not coalesce(private.nest_summary_push_current(v_summary,v_device),false) then
    update private.nest_push_deliveries set state='cancelled' where id=p_delivery;
    return null;
  end if;
  update private.nest_push_deliveries set state='sending',attempt_id=v_attempt,started_at=clock_timestamp() where id=p_delivery;
  return jsonb_build_object('version',1,'deliveryId',p_delivery,'attemptId',v_attempt,
    'outboxId',v_summary.id,'installationId',v_device.installation_id,'registrationRevision',v_device.revision,
    'token',v_device.token,'householdId',v_summary.household_id,'summaryId',v_summary.id,'recipientId',v_summary.recipient_id);
end;
$$;
revoke all on function private.nest_begin_push_delivery_once(uuid) from public,anon,authenticated,service_role;
