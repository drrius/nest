-- Gated private persistence. No provider request or hosted worker is activated.
-- Each authorized attempt has immutable identity, independent of a future retry.
create table private.nest_push_delivery_attempts (
  id uuid primary key, delivery_id uuid not null references private.nest_push_deliveries(id),
  registration_revision uuid not null, started_at timestamptz not null
);
create index nest_push_delivery_attempts_delivery on private.nest_push_delivery_attempts(delivery_id);
alter table private.nest_push_delivery_attempts enable row level security;
revoke all on private.nest_push_delivery_attempts from public,anon,authenticated,service_role;
insert into private.nest_push_delivery_attempts select attempt_id,id,registration_revision,started_at
  from private.nest_push_deliveries where attempt_id is not null;
create trigger nest_push_delivery_attempts_immutable before update or delete on private.nest_push_delivery_attempts
  for each row execute function private.reject_financial_history_change();
alter function private.nest_begin_push_delivery(uuid) rename to nest_begin_push_delivery_once;
create function private.nest_begin_push_delivery(p_delivery uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  v_result:=private.nest_begin_push_delivery_once(p_delivery);
  if v_result is not null then
    insert into private.nest_push_delivery_attempts
      select attempt_id,id,registration_revision,started_at from private.nest_push_deliveries where id=p_delivery;
  end if;
  return v_result;
end;
$$;
revoke all on function private.nest_begin_push_delivery(uuid) from public,anon,authenticated,service_role;

create table private.nest_push_send_results (
  attempt_id uuid primary key references private.nest_push_delivery_attempts(id),
  result jsonb not null, acknowledgment jsonb not null
);
create table private.nest_push_receipt_results (
  attempt_id uuid primary key references private.nest_push_delivery_attempts(id),
  ticket_id text not null unique, result jsonb not null, acknowledgment jsonb not null
);
alter table private.nest_push_send_results enable row level security;
alter table private.nest_push_receipt_results enable row level security;
revoke all on private.nest_push_send_results,private.nest_push_receipt_results from public,anon,authenticated,service_role;
create trigger nest_push_send_results_immutable before update or delete on private.nest_push_send_results
  for each row execute function private.reject_financial_history_change();
create trigger nest_push_receipt_results_immutable before update or delete on private.nest_push_receipt_results
  for each row execute function private.reject_financial_history_change();

create function private.nest_push_result(p_result jsonb,p_receipt boolean)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_status text;
begin
  if p_receipt is null or p_result is null or jsonb_typeof(p_result) is distinct from 'object'
    or octet_length(p_result::text)>1024 or jsonb_typeof(p_result->'status') is distinct from 'string' then
    raise exception 'Invalid push outcome' using errcode='22023'; end if;
  v_status:=p_result->>'status';
  if (p_receipt and v_status='accepted') or (not p_receipt and v_status='unknown') then
    if p_result-array['status']<>'{}'::jsonb then raise exception 'Invalid push outcome' using errcode='22023'; end if;
  elsif not p_receipt and v_status='ticket' then
    if p_result-array['status','ticketId']<>'{}'::jsonb
      or jsonb_typeof(p_result->'ticketId') is distinct from 'string'
      or length(p_result->>'ticketId') not between 1 and 200
      or (p_result->>'ticketId') collate "C" !~'^[A-Za-z0-9_-]+$' then
      raise exception 'Invalid push ticket' using errcode='22023'; end if;
  elsif v_status='rejected' then
    if p_result-array['status','reason']<>'{}'::jsonb
      or jsonb_typeof(p_result->'reason') is distinct from 'string'
      or p_result->>'reason' not in ('device_not_registered','message_too_big','rate_limited','invalid_credentials','provider_rejected') then
      raise exception 'Invalid push rejection' using errcode='22023'; end if;
  else raise exception 'Invalid push outcome' using errcode='22023'; end if;
  return p_result;
end;
$$;
revoke all on function private.nest_push_result(jsonb,boolean) from public,anon,authenticated,service_role;

create function private.nest_disable_rejected_push_device(p_delivery private.nest_push_deliveries,p_result jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_result->>'reason'='device_not_registered' then
    update private.nest_push_devices d set token=null,revision=gen_random_uuid()
      from private.nest_renewal_reminder_outbox o
      where d.installation_id=p_delivery.installation_id and d.revision=p_delivery.registration_revision
        and o.id=p_delivery.outbox_id and d.actor_id=o.recipient_id and d.household_id=o.household_id;
  end if;
end;
$$;
revoke all on function private.nest_disable_rejected_push_device(private.nest_push_deliveries,jsonb) from public,anon,authenticated,service_role;

create function private.nest_finish_push_send(p_delivery uuid,p_attempt uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_delivery private.nest_push_deliveries; v_result jsonb:=private.nest_push_result(p_result,false);
  v_previous private.nest_push_send_results; v_ack jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_delivery from private.nest_push_deliveries where id=p_delivery for update;
  if p_attempt is null or v_delivery.id is null or v_delivery.attempt_id is distinct from p_attempt then
    raise exception 'Push attempt mismatch' using errcode='22023'; end if;
  select * into v_previous from private.nest_push_send_results where attempt_id=p_attempt;
  if found then
    if v_previous.result<>v_result then raise exception 'Push outcome changed' using errcode='22023'; end if;
    return v_previous.acknowledgment;
  end if;
  if v_delivery.state not in ('sending','unknown') then raise exception 'Push attempt closed' using errcode='40001'; end if;
  update private.nest_push_deliveries set state=v_result->>'status',ticket_id=v_result->>'ticketId' where id=p_delivery;
  perform private.nest_disable_rejected_push_device(v_delivery,v_result);
  v_ack:=jsonb_build_object('version',1,'deliveryId',p_delivery,'attemptId',p_attempt,'result',v_result);
  insert into private.nest_push_send_results values(p_attempt,v_result,v_ack);
  return v_ack;
end;
$$;
revoke all on function private.nest_finish_push_send(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function private.nest_finish_push_receipt(p_delivery uuid,p_attempt uuid,p_ticket text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_delivery private.nest_push_deliveries; v_result jsonb:=private.nest_push_result(p_result,true);
  v_previous private.nest_push_receipt_results; v_ack jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_delivery from private.nest_push_deliveries where id=p_delivery for update;
  if p_attempt is null or p_ticket is null or v_delivery.id is null
    or v_delivery.attempt_id is distinct from p_attempt or v_delivery.ticket_id is distinct from p_ticket then
    raise exception 'Push receipt mismatch' using errcode='22023'; end if;
  select * into v_previous from private.nest_push_receipt_results where attempt_id=p_attempt;
  if found then
    if v_previous.result<>v_result then raise exception 'Push receipt changed' using errcode='22023'; end if;
    return v_previous.acknowledgment;
  end if;
  if v_delivery.state<>'ticket' then raise exception 'Push receipt unavailable' using errcode='40001'; end if;
  update private.nest_push_deliveries set state=v_result->>'status' where id=p_delivery;
  perform private.nest_disable_rejected_push_device(v_delivery,v_result);
  v_ack:=jsonb_build_object('version',1,'deliveryId',p_delivery,'attemptId',p_attempt,'ticketId',p_ticket,'result',v_result);
  insert into private.nest_push_receipt_results values(p_attempt,p_ticket,v_result,v_ack);
  return v_ack;
end;
$$;
revoke all on function private.nest_finish_push_receipt(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
