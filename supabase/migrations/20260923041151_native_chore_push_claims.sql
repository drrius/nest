-- GATED chore source on the existing immutable delivery journal. No hosted sends.
alter table private.nest_push_deliveries
  add column chore_id uuid references private.nest_chore_reminder_outbox(id),
  drop constraint nest_push_exactly_one_source,
  add constraint nest_push_exactly_one_source check(num_nonnulls(outbox_id,summary_id,chore_id)=1),
  add constraint nest_push_chore_installation unique(chore_id,installation_id);

create function private.nest_chore_push_current(p_outbox private.nest_chore_reminder_outbox,p_device private.nest_push_devices)
returns boolean language sql volatile security definer set search_path='' as $$
  select p_outbox.state='pending' and p_outbox.due_at<=clock_timestamp()
    and p_outbox.due_at>clock_timestamp()-interval '1 day'
    and p_device.token is not null and p_device.household_id=p_outbox.household_id
    and p_device.actor_id=p_outbox.recipient_id
    and private.nest_chore_reminder_current(p_outbox)
    and exists(select 1 from auth.sessions s where s.id=p_device.session_id and s.user_id=p_device.actor_id
      and (s.not_after is null or s.not_after>clock_timestamp()))
    and not exists(select 1 from private.nest_push_revoked_sessions r
      where r.actor_id=p_device.actor_id and r.session_id=p_device.session_id);
$$;
revoke all on function private.nest_chore_push_current(private.nest_chore_reminder_outbox,private.nest_push_devices) from public,anon,authenticated,service_role;

create function private.nest_prepare_chore_push(p_outbox uuid,p_installation uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_outbox private.nest_chore_reminder_outbox; v_device private.nest_push_devices; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_outbox from private.nest_chore_reminder_outbox where id=p_outbox for share;
  select * into v_device from private.nest_push_devices where installation_id=p_installation for share;
  if not coalesce(private.nest_chore_push_current(v_outbox,v_device),false) then return null; end if;
  insert into private.nest_push_deliveries(chore_id,installation_id,registration_revision)
    values(p_outbox,p_installation,v_device.revision)
    on conflict(chore_id,installation_id) do update set registration_revision=excluded.registration_revision,state='ready'
      where private.nest_push_deliveries.state in ('ready','cancelled') and private.nest_push_deliveries.attempt_id is null
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.nest_prepare_chore_push(uuid,uuid) from public,anon,authenticated,service_role;

create function private.nest_begin_chore_push_once(p_delivery uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_delivery private.nest_push_deliveries; v_outbox private.nest_chore_reminder_outbox;
  v_device private.nest_push_devices; v_occurrence public.routine_occurrences; v_attempt uuid:=gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_delivery from private.nest_push_deliveries where id=p_delivery for update;
  if v_delivery.id is null or v_delivery.state<>'ready' or v_delivery.chore_id is null then return null; end if;
  select * into strict v_outbox from private.nest_chore_reminder_outbox where id=v_delivery.chore_id for share;
  perform pg_advisory_xact_lock(hashtextextended('nest-notification-preferences:'||v_outbox.household_id::text||':'||v_outbox.recipient_id::text,0));
  select * into v_occurrence from public.routine_occurrences
    where household_id=v_outbox.household_id and id=v_outbox.occurrence_id for share;
  -- Routine edits lock the definition first. Never wait with an occurrence lock.
  perform 1 from public.routines where household_id=v_outbox.household_id and id=v_occurrence.routine_id for share nowait;
  perform 1 from public.nest_chore_reminders where household_id=v_outbox.household_id and occurrence_id=v_outbox.occurrence_id for share;
  perform 1 from public.household_members where household_id=v_outbox.household_id and user_id=v_outbox.recipient_id for share;
  perform 1 from public.nest_notification_preferences where household_id=v_outbox.household_id and actor_id=v_outbox.recipient_id for share;
  select * into v_device from private.nest_push_devices where installation_id=v_delivery.installation_id for share;
  perform 1 from auth.sessions where id=v_device.session_id for share;
  if v_device.revision is distinct from v_delivery.registration_revision
    or not coalesce(private.nest_chore_push_current(v_outbox,v_device),false) then
    update private.nest_push_deliveries set state='cancelled' where id=p_delivery;
    return null;
  end if;
  update private.nest_push_deliveries set state='sending',attempt_id=v_attempt,started_at=clock_timestamp() where id=p_delivery;
  return jsonb_build_object('version',1,'deliveryId',p_delivery,'attemptId',v_attempt,
    'outboxId',v_outbox.id,'installationId',v_device.installation_id,'registrationRevision',v_device.revision,
    'token',v_device.token,'householdId',v_outbox.household_id,'occurrenceId',v_outbox.occurrence_id);
exception when lock_not_available then return null;
end;
$$;
revoke all on function private.nest_begin_chore_push_once(uuid) from public,anon,authenticated,service_role;

create or replace function private.nest_begin_push_delivery_once(p_delivery uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_delivery private.nest_push_deliveries; v_summary private.nest_daily_summary_outbox;
  v_device private.nest_push_devices; v_attempt uuid:=gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_delivery from private.nest_push_deliveries where id=p_delivery for update;
  if v_delivery.id is null or v_delivery.state<>'ready' then return null; end if;
  if v_delivery.chore_id is not null then return private.nest_begin_chore_push_once(p_delivery); end if;
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

-- GATED: retain the existing immutable outcomes, ticket polling and capped backoff.
create or replace function private.nest_disable_rejected_push_device(p_delivery private.nest_push_deliveries,p_result jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_result->>'reason'='device_not_registered' then
    update private.nest_push_devices d set token=null,revision=gen_random_uuid()
      from (
        select household_id,recipient_id from private.nest_renewal_reminder_outbox where id=p_delivery.outbox_id
        union all
        select household_id,recipient_id from private.nest_daily_summary_outbox where id=p_delivery.summary_id
        union all
        select household_id,recipient_id from private.nest_chore_reminder_outbox where id=p_delivery.chore_id
      ) o
      where d.installation_id=p_delivery.installation_id and d.revision=p_delivery.registration_revision
        and d.actor_id=o.recipient_id and d.household_id=o.household_id;
  end if;
end;
$$;
revoke all on function private.nest_disable_rejected_push_device(private.nest_push_deliveries,jsonb) from public,anon,authenticated,service_role;

create or replace function private.nest_retry_push_delivery(p_delivery uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_delivery private.nest_push_deliveries; v_outbox private.nest_renewal_reminder_outbox;
  v_chore private.nest_chore_reminder_outbox; v_summary private.nest_daily_summary_outbox; v_device private.nest_push_devices; v_reason text; v_recorded timestamptz; v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_delivery from private.nest_push_deliveries where id=p_delivery for update;
  if v_delivery.id is null or v_delivery.state<>'rejected' then return false; end if;
  select coalesce(r.result,s.result)->>'reason',coalesce(r.recorded_at,s.recorded_at)
    into v_reason,v_recorded from private.nest_push_send_results s
    left join private.nest_push_receipt_results r on r.attempt_id=s.attempt_id
    where s.attempt_id=v_delivery.attempt_id;
  select count(*) into v_count from private.nest_push_delivery_attempts where delivery_id=p_delivery;
  if v_reason is distinct from 'rate_limited' or v_recorded is null or v_count not between 1 and 2
    or clock_timestamp()<v_recorded+make_interval(secs=>30*power(2,v_count-1)::integer) then return false; end if;
  select * into v_outbox from private.nest_renewal_reminder_outbox where id=v_delivery.outbox_id for share;
  select * into v_device from private.nest_push_devices where installation_id=v_delivery.installation_id for share;
  if v_delivery.chore_id is not null then
    select * into v_chore from private.nest_chore_reminder_outbox where id=v_delivery.chore_id for share;
    if not coalesce(private.nest_chore_push_current(v_chore,v_device),false) then return false; end if;
  elsif v_delivery.summary_id is not null then
    select * into v_summary from private.nest_daily_summary_outbox where id=v_delivery.summary_id for share;
    if not coalesce(private.nest_summary_push_current(v_summary,v_device),false) then return false; end if;
  elsif not coalesce(private.nest_push_delivery_current(v_outbox,v_device),false) then return false;
  end if;
  update private.nest_push_deliveries set state='ready',registration_revision=v_device.revision,
    attempt_id=null,started_at=null,ticket_id=null where id=p_delivery;
  return true;
end;
$$;
revoke all on function private.nest_retry_push_delivery(uuid) from public,anon,authenticated,service_role;

grant execute on function private.nest_retry_push_delivery(uuid) to service_role;
