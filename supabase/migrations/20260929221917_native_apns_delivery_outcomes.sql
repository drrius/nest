-- GATED local validation: separate provider attempts/outcomes, no hosted dispatch.
alter table private.nest_push_deliveries drop constraint nest_push_deliveries_state_check;
alter table private.nest_push_deliveries add constraint nest_push_deliveries_state_check
  check(state in ('ready','sending','unknown','ticket','accepted','rejected','cancelled','provider_accepted'));
alter table private.nest_push_deliveries add constraint nest_push_apns_accepted
  check(state<>'provider_accepted' or (attempt_id is not null and ticket_id is null));

create table private.nest_apns_delivery_attempts (
  id uuid primary key references private.nest_push_delivery_attempts(id),
  environment text not null check(environment in ('sandbox','production')),
  registered_at timestamptz not null
);
alter table private.nest_apns_delivery_attempts enable row level security;
revoke all on private.nest_apns_delivery_attempts from public,anon,authenticated,service_role;
create trigger nest_apns_delivery_attempts_immutable before update or delete on private.nest_apns_delivery_attempts
  for each row execute function private.reject_financial_history_change();

create function private.nest_begin_apns_delivery(p_delivery uuid,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device private.nest_push_devices; v_result jsonb;
begin
  if p_environment is null or p_environment not in ('sandbox','production') then
    raise exception 'Invalid APNs environment' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select d.* into v_device from private.nest_push_deliveries a
    join private.nest_push_devices d on d.installation_id=a.installation_id
    where a.id=p_delivery for share of d;
  if v_device.provider is distinct from 'apns'
    or v_device.apns_environment is distinct from p_environment then return null; end if;
  -- Reuse all six audited current-membership, item, mute and live-session checks.
  v_result:=private.nest_begin_push_delivery_once(p_delivery);
  if v_result is null then return null; end if;
  insert into private.nest_push_delivery_attempts(id,delivery_id,registration_revision,started_at)
    select attempt_id,id,registration_revision,started_at from private.nest_push_deliveries where id=p_delivery;
  insert into private.nest_apns_delivery_attempts values((v_result->>'attemptId')::uuid,p_environment,v_device.registered_at);
  return v_result||jsonb_build_object('provider','apns','environment',p_environment,'apnsId',v_result->>'attemptId');
end;
$$;
revoke all on function private.nest_begin_apns_delivery(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.nest_begin_apns_delivery(uuid,text) to service_role;
create function public.nest_begin_apns_delivery(p_delivery uuid,p_environment text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_begin_apns_delivery($1,$2);
$$;
revoke all on function public.nest_begin_apns_delivery(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.nest_begin_apns_delivery(uuid,text) to service_role;

create function private.nest_apns_result(p_result jsonb,p_attempt uuid)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_status text;
begin
  if p_attempt is null or p_result is null or jsonb_typeof(p_result) is distinct from 'object'
    or octet_length(p_result::text)>1024 or jsonb_typeof(p_result->'status') is distinct from 'string' then
    raise exception 'Invalid APNs outcome' using errcode='22023'; end if;
  v_status:=p_result->>'status';
  if v_status='provider_accepted' then
    if p_result-array['status','apnsId']<>'{}'::jsonb
      or private.nest_expense_uuid(p_result->'apnsId',false)::uuid<>p_attempt then
      raise exception 'APNs response identity mismatch' using errcode='22023'; end if;
    return jsonb_build_object('status',v_status,'apnsId',p_attempt);
  elsif v_status='unknown' then
    if p_result-array['status']<>'{}'::jsonb then
      raise exception 'Invalid APNs outcome' using errcode='22023'; end if;
  elsif v_status='rejected' then
    if p_result-array['status','reason','invalidatedAt']<>'{}'::jsonb
      or jsonb_typeof(p_result->'reason') is distinct from 'string'
      or p_result->>'reason' not in ('invalid_device','invalid_credentials','message_too_big',
        'rate_limited','provider_unavailable','provider_rejected') then
      raise exception 'Invalid APNs rejection' using errcode='22023'; end if;
    if p_result ? 'invalidatedAt' then
      if p_result->>'reason'<>'invalid_device' or jsonb_typeof(p_result->'invalidatedAt') is distinct from 'number'
        or (p_result->>'invalidatedAt') !~'^[0-9]+$'
        or (p_result->>'invalidatedAt')::numeric>9007199254740991 then
        raise exception 'Invalid APNs invalidation time' using errcode='22023'; end if;
    end if;
  else raise exception 'Invalid APNs outcome' using errcode='22023'; end if;
  return p_result;
end;
$$;
revoke all on function private.nest_apns_result(jsonb,uuid) from public,anon,authenticated,service_role;

create function private.nest_finish_apns_send(p_delivery uuid,p_attempt uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_delivery private.nest_push_deliveries; v_identity private.nest_apns_delivery_attempts;
  v_result jsonb:=private.nest_apns_result(p_result,p_attempt);
  v_previous private.nest_push_send_results; v_ack jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select i.* into v_identity from private.nest_apns_delivery_attempts i
    join private.nest_push_delivery_attempts a on a.id=i.id where i.id=p_attempt and a.delivery_id=p_delivery;
  if v_identity.id is null then raise exception 'APNs attempt mismatch' using errcode='22023'; end if;
  select * into v_previous from private.nest_push_send_results where attempt_id=p_attempt;
  if found then
    if v_previous.result<>v_result then raise exception 'APNs outcome changed' using errcode='22023'; end if;
    return v_previous.acknowledgment;
  end if;
  select * into v_delivery from private.nest_push_deliveries where id=p_delivery for update;
  if v_delivery.attempt_id is distinct from p_attempt then
    raise exception 'APNs attempt mismatch' using errcode='22023'; end if;
  if v_delivery.state not in ('sending','unknown') then
    raise exception 'APNs attempt closed' using errcode='PT412'; end if;
  update private.nest_push_deliveries set state=v_result->>'status',ticket_id=null where id=p_delivery;
  if v_result->>'reason'='invalid_device'
    and (not(v_result ? 'invalidatedAt')
      or extract(epoch from v_identity.registered_at)*1000<=(v_result->>'invalidatedAt')::numeric)
    and exists(select 1 from private.nest_push_devices d where d.installation_id=v_delivery.installation_id
      and d.provider='apns' and d.apns_environment=v_identity.environment
      and d.registered_at=v_identity.registered_at and d.revision=v_delivery.registration_revision) then
    perform private.nest_disable_rejected_push_device(v_delivery,
      jsonb_build_object('status','rejected','reason','device_not_registered'));
  end if;
  v_ack:=jsonb_build_object('version',1,'provider','apns','deliveryId',p_delivery,'attemptId',p_attempt,'result',v_result);
  insert into private.nest_push_send_results(attempt_id,result,acknowledgment) values(p_attempt,v_result,v_ack);
  return v_ack;
end;
$$;
revoke all on function private.nest_finish_apns_send(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_finish_apns_send(uuid,uuid,jsonb) to service_role;
create function public.nest_finish_apns_send(p_delivery uuid,p_attempt uuid,p_result jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_finish_apns_send($1,$2,$3);
$$;
revoke all on function public.nest_finish_apns_send(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_finish_apns_send(uuid,uuid,jsonb) to service_role;

-- APNs attempts cannot receive fabricated Expo tickets through the old endpoint.
alter function private.nest_finish_push_send(uuid,uuid,jsonb) rename to nest_finish_expo_push_send;
revoke all on function private.nest_finish_expo_push_send(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function private.nest_finish_push_send(p_delivery uuid,p_attempt uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.nest_apns_delivery_attempts where id=p_attempt) then
    raise exception 'APNs outcome requires its own endpoint' using errcode='22023'; end if;
  return private.nest_finish_expo_push_send(p_delivery,p_attempt,p_result);
end;
$$;
revoke all on function private.nest_finish_push_send(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_finish_push_send(uuid,uuid,jsonb) to service_role;
