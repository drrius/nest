-- Gated private primitives only. No hosted job, public RPC or push send is enabled.
create table private.nest_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references private.nest_renewal_reminder_outbox(id),
  installation_id uuid not null,
  registration_revision uuid not null,
  state text not null default 'ready' check(state in ('ready','sending','unknown','ticket','accepted','rejected','cancelled')),
  attempt_id uuid unique,
  started_at timestamptz,
  ticket_id text unique,
  unique(outbox_id,installation_id),
  check((attempt_id is null)=(started_at is null)),
  check(state not in ('sending','unknown','ticket','accepted','rejected') or attempt_id is not null),
  check(ticket_id is null or (length(ticket_id) between 1 and 200 and ticket_id ~'^[A-Za-z0-9_-]+$')),
  check(state not in ('ticket','accepted') or ticket_id is not null)
);
alter table private.nest_push_deliveries enable row level security;
revoke all on private.nest_push_deliveries from public,anon,authenticated,service_role;
create index nest_push_deliveries_ready on private.nest_push_deliveries(id) where state='ready';

create function private.nest_push_delivery_current(p_outbox private.nest_renewal_reminder_outbox,p_device private.nest_push_devices)
returns boolean language sql volatile security definer set search_path='' as $$
  select p_outbox.state='pending' and p_outbox.due_at<=clock_timestamp()
    and p_outbox.due_at>clock_timestamp()-interval '1 day'
    and p_device.token is not null and p_device.household_id=p_outbox.household_id
    and p_device.actor_id=p_outbox.recipient_id
    and private.nest_renewal_reminder_current(p_outbox)
    and exists(select 1 from auth.sessions s where s.id=p_device.session_id and s.user_id=p_device.actor_id
      and (s.not_after is null or s.not_after>clock_timestamp()))
    and not exists(select 1 from private.nest_push_revoked_sessions r
      where r.actor_id=p_device.actor_id and r.session_id=p_device.session_id);
$$;
revoke all on function private.nest_push_delivery_current(private.nest_renewal_reminder_outbox,private.nest_push_devices) from public,anon,authenticated,service_role;

create function private.nest_prepare_push_delivery(p_outbox uuid,p_installation uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_outbox private.nest_renewal_reminder_outbox; v_device private.nest_push_devices; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_outbox from private.nest_renewal_reminder_outbox where id=p_outbox for share;
  select * into v_device from private.nest_push_devices where installation_id=p_installation for share;
  if not coalesce(private.nest_push_delivery_current(v_outbox,v_device),false) then return null; end if;
  insert into private.nest_push_deliveries(outbox_id,installation_id,registration_revision)
    values(p_outbox,p_installation,v_device.revision)
    on conflict(outbox_id,installation_id) do update set registration_revision=excluded.registration_revision,state='ready'
      where private.nest_push_deliveries.state in ('ready','cancelled') and private.nest_push_deliveries.attempt_id is null
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.nest_prepare_push_delivery(uuid,uuid) from public,anon,authenticated,service_role;

-- Only this transition releases the token. Its one-use attempt cannot be claimed
-- again after a crash or lost acknowledgment, which would risk duplicate delivery.
-- External sending is outside the transaction: revalidation linearizes here.
create function private.nest_begin_push_delivery(p_delivery uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_delivery private.nest_push_deliveries; v_outbox private.nest_renewal_reminder_outbox;
  v_device private.nest_push_devices; v_attempt uuid:=gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_delivery from private.nest_push_deliveries where id=p_delivery for update;
  if v_delivery.id is null or v_delivery.state<>'ready' then return null; end if;
  select * into v_outbox from private.nest_renewal_reminder_outbox where id=v_delivery.outbox_id for share;
  select * into v_device from private.nest_push_devices where installation_id=v_delivery.installation_id for share;
  -- Prevent the membership/preferences/item/session evidence from changing during
  -- this short authorization transaction. No lock spans the provider HTTP request.
  perform 1 from public.nest_renewals where household_id=v_outbox.household_id and id=v_outbox.renewal_id for share;
  perform 1 from public.nest_renewal_reminders where household_id=v_outbox.household_id and renewal_id=v_outbox.renewal_id for share;
  perform 1 from public.household_members where household_id=v_outbox.household_id and user_id=v_outbox.recipient_id for share;
  perform 1 from public.nest_notification_preferences where household_id=v_outbox.household_id and actor_id=v_outbox.recipient_id for share;
  perform 1 from auth.sessions where id=v_device.session_id for share;
  if v_device.revision is distinct from v_delivery.registration_revision
    or not coalesce(private.nest_push_delivery_current(v_outbox,v_device),false) then
    update private.nest_push_deliveries set state='cancelled' where id=p_delivery;
    return null;
  end if;
  update private.nest_push_deliveries set state='sending',attempt_id=v_attempt,started_at=clock_timestamp() where id=p_delivery;
  return jsonb_build_object('version',1,'deliveryId',p_delivery,'attemptId',v_attempt,
    'outboxId',v_outbox.id,'installationId',v_device.installation_id,'registrationRevision',v_device.revision,
    'token',v_device.token,'householdId',v_outbox.household_id,'renewalId',v_outbox.renewal_id);
end;
$$;
revoke all on function private.nest_begin_push_delivery(uuid) from public,anon,authenticated,service_role;
