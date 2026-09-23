-- Gated retry policy: three attempts total, only confirmed rate-limit rejection.
alter table private.nest_push_send_results add column recorded_at timestamptz not null default clock_timestamp();
alter table private.nest_push_receipt_results add column recorded_at timestamptz not null default clock_timestamp();
create unique index nest_push_send_ticket_identity on private.nest_push_send_results((result->>'ticketId')) where result->>'status'='ticket';
create or replace function private.nest_finish_push_send(p_delivery uuid,p_attempt uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_delivery private.nest_push_deliveries; v_result jsonb:=private.nest_push_result(p_result,false);
  v_previous private.nest_push_send_results; v_ack jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_delivery from private.nest_push_deliveries where id=p_delivery for update;
  if p_attempt is null or v_delivery.id is null then
    raise exception 'Push attempt mismatch' using errcode='22023'; end if;
  select * into v_previous from private.nest_push_send_results where attempt_id=p_attempt;
  if found then
    if v_previous.acknowledgment->>'deliveryId' is distinct from p_delivery::text or v_previous.result<>v_result then raise exception 'Push outcome changed' using errcode='22023'; end if;
    return v_previous.acknowledgment;
  end if;
  if v_delivery.attempt_id is distinct from p_attempt then raise exception 'Push attempt mismatch' using errcode='22023'; end if;
  if v_delivery.state not in ('sending','unknown') then raise exception 'Push attempt closed' using errcode='40001'; end if;
  update private.nest_push_deliveries set state=v_result->>'status',ticket_id=v_result->>'ticketId' where id=p_delivery;
  perform private.nest_disable_rejected_push_device(v_delivery,v_result);
  v_ack:=jsonb_build_object('version',1,'deliveryId',p_delivery,'attemptId',p_attempt,'result',v_result);
  insert into private.nest_push_send_results(attempt_id,result,acknowledgment) values(p_attempt,v_result,v_ack);
  return v_ack;
end;
$$;
revoke all on function private.nest_finish_push_send(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function private.nest_finish_push_receipt(p_delivery uuid,p_attempt uuid,p_ticket text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_delivery private.nest_push_deliveries; v_result jsonb:=private.nest_push_result(p_result,true);
  v_previous private.nest_push_receipt_results; v_ack jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_delivery from private.nest_push_deliveries where id=p_delivery for update;
  if p_attempt is null or p_ticket is null or v_delivery.id is null then
    raise exception 'Push receipt mismatch' using errcode='22023'; end if;
  select * into v_previous from private.nest_push_receipt_results where attempt_id=p_attempt;
  if found then
    if v_previous.acknowledgment->>'deliveryId' is distinct from p_delivery::text or v_previous.ticket_id<>p_ticket or v_previous.result<>v_result then raise exception 'Push receipt changed' using errcode='22023'; end if;
    return v_previous.acknowledgment;
  end if;
  if v_delivery.attempt_id is distinct from p_attempt or v_delivery.ticket_id is distinct from p_ticket then
    raise exception 'Push receipt mismatch' using errcode='22023'; end if;
  if v_delivery.state<>'ticket' then raise exception 'Push receipt unavailable' using errcode='40001'; end if;
  update private.nest_push_deliveries set state=v_result->>'status' where id=p_delivery;
  perform private.nest_disable_rejected_push_device(v_delivery,v_result);
  v_ack:=jsonb_build_object('version',1,'deliveryId',p_delivery,'attemptId',p_attempt,'ticketId',p_ticket,'result',v_result);
  insert into private.nest_push_receipt_results(attempt_id,ticket_id,result,acknowledgment) values(p_attempt,p_ticket,v_result,v_ack);
  return v_ack;
end;
$$;
revoke all on function private.nest_finish_push_receipt(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

create function private.nest_retry_push_delivery(p_delivery uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_delivery private.nest_push_deliveries; v_outbox private.nest_renewal_reminder_outbox;
  v_device private.nest_push_devices; v_reason text; v_recorded timestamptz; v_count integer;
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
  if not coalesce(private.nest_push_delivery_current(v_outbox,v_device),false) then return false; end if;
  update private.nest_push_deliveries set state='ready',registration_revision=v_device.revision,
    attempt_id=null,started_at=null,ticket_id=null where id=p_delivery;
  return true;
end;
$$;
revoke all on function private.nest_retry_push_delivery(uuid) from public,anon,authenticated,service_role;

-- A lost begin/worker crash has no evidence of non-delivery. Never requeue it.
create index nest_push_sending_age on private.nest_push_deliveries(started_at,id) where state='sending';
create function private.nest_expire_push_sends()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer; v_before timestamptz:=clock_timestamp()-interval '2 minutes';
begin
  with stale as (
    select id from private.nest_push_deliveries where state='sending'
      and started_at<v_before
      order by started_at,id limit 100 for update skip locked
  ) update private.nest_push_deliveries d set state='unknown' from stale s where d.id=s.id;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function private.nest_expire_push_sends() from public,anon,authenticated,service_role;
