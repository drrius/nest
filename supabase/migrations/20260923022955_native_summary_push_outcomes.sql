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
  v_summary private.nest_daily_summary_outbox; v_device private.nest_push_devices; v_reason text; v_recorded timestamptz; v_count integer;
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
  if v_delivery.summary_id is not null then
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
