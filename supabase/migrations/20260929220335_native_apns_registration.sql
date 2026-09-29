-- GATED local validation. No hosted enrollment or dispatch is activated.
-- Existing Expo rows/receipts remain intact. APNs identity includes its environment.
alter table private.nest_push_devices
  add column provider text not null default 'expo',
  add column apns_environment text,
  add column registered_at timestamptz not null default clock_timestamp(),
  add constraint nest_push_provider check(provider in ('expo','apns')),
  add constraint nest_push_environment check(
    (provider='expo' and apns_environment is null)
    or (provider='apns' and apns_environment is not null and apns_environment in ('sandbox','production'))),
  add constraint nest_push_apns_token check(provider<>'apns' or token is null or
    (length(token) between 2 and 4096 and length(token)%2=0 and translate(token,'0123456789abcdef','')=''));
drop index private.nest_push_device_active_token;
create unique index nest_push_device_active_token on private.nest_push_devices
  (provider,coalesce(apns_environment,''),token_hash) where token is not null;

create or replace function private.nest_push_device_command(p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_action text; v_command jsonb; v_token text; v_apns boolean;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>32768
    or not(p_input ?& array['operationId','installationId','expectedRevision','action'])
    or jsonb_typeof(p_input->'action') is distinct from 'string' then
    raise exception 'Invalid device command' using errcode='22023'; end if;
  v_action:=p_input->>'action';
  v_apns:=p_input ? 'provider' or p_input ? 'environment';
  if v_action not in ('register','disable')
    or p_input-array['operationId','installationId','expectedRevision','action','token','provider','environment']<>'{}'::jsonb
    or (v_action='disable' and (p_input ? 'token' or v_apns)) then
    raise exception 'Invalid device action' using errcode='22023'; end if;
  v_command:=jsonb_build_object('operationId',private.nest_expense_uuid(p_input->'operationId',false),
    'installationId',private.nest_expense_uuid(p_input->'installationId',false),
    'expectedRevision',private.nest_expense_uuid(p_input->'expectedRevision',true),'action',v_action);
  if v_action='register' then
    v_token:=p_input->>'token';
    if jsonb_typeof(p_input->'token') is distinct from 'string' or length(v_token) not between 1 and 4096
      or v_token collate "C" !~'^[!-~]+$' then
      raise exception 'Invalid device token' using errcode='22023'; end if;
    if v_apns then
      if p_input->'provider' is distinct from '"apns"'::jsonb
        or jsonb_typeof(p_input->'environment') is distinct from 'string'
        or p_input->>'environment' not in ('sandbox','production')
        or length(v_token)%2<>0 or translate(v_token,'0123456789abcdef','')<>'' then
        raise exception 'Invalid APNs registration' using errcode='22023'; end if;
      v_command:=v_command||jsonb_build_object('provider','apns','environment',p_input->>'environment');
    end if;
    v_command:=v_command||jsonb_build_object('token',v_token);
  end if;
  return v_command;
end;
$$;
revoke all on function private.nest_push_device_command(jsonb) from public,anon,authenticated,service_role;

create or replace function private.nest_push_device_digest(p_command jsonb,p_actor uuid,p_household uuid)
returns text language plpgsql immutable set search_path='' as $$
declare v_command jsonb; v_fields text[];
begin
  if p_actor is null or p_household is null then
    raise exception 'Missing device identity' using errcode='22023'; end if;
  v_command:=private.nest_push_device_command(p_command);
  v_fields:=array[
    case when v_command->>'provider'='apns' then 'nest-push-device/apns-v1' else 'nest-push-device/v1' end,
    p_actor::text,p_household::text,v_command->>'operationId',v_command->>'installationId',
    coalesce(v_command->>'expectedRevision',''),v_command->>'action',coalesce(v_command->>'token','')];
  if v_command->>'provider'='apns' then
    v_fields:=v_fields||array['apns',v_command->>'environment'];
  end if;
  return encode(extensions.digest(convert_to(array_to_string(v_fields,E'\n'),'UTF8'),'sha256'),'hex');
end;
$$;
revoke all on function private.nest_push_device_digest(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

-- Retain existing public membership/session/cancellation wrappers unchanged.
create or replace function private.nest_save_push_device(p_household uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_command jsonb; v_digest text; v_previous private.nest_push_device_operations;
  v_device private.nest_push_devices; v_revision uuid:=gen_random_uuid(); v_receipt jsonb; v_expected uuid;
begin
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Membership required' using errcode='42501'; end if;
  v_command:=private.nest_push_device_command(p_input);
  v_digest:=private.nest_push_device_digest(v_command,v_actor,p_household);
  -- Two-member app: serialize rare enrollment changes to avoid token/installation lock inversion.
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  select * into v_previous from private.nest_push_device_operations
    where actor_id=v_actor and household_id=p_household and operation_id=(v_command->>'operationId')::uuid;
  if found then
    if v_previous.command_digest<>v_digest then raise exception 'Device operation changed' using errcode='22023'; end if;
    return v_previous.receipt;
  end if;
  select * into v_device from private.nest_push_devices
    where installation_id=(v_command->>'installationId')::uuid for update;
  v_expected:=(v_command->>'expectedRevision')::uuid;
  if v_device.installation_id is not null and (v_device.actor_id<>v_actor or v_device.household_id<>p_household) then
    if v_command->>'action'<>'register' or v_device.token is not null or v_expected is not null then
      raise exception 'Installation unavailable' using errcode='42501'; end if;
  elsif v_device.revision is distinct from v_expected then
    raise exception 'Device registration changed' using errcode='PT412';
  end if;
  insert into private.nest_push_devices(installation_id,actor_id,household_id,revision,token,provider,apns_environment,registered_at)
    values((v_command->>'installationId')::uuid,v_actor,p_household,v_revision,v_command->>'token',
      case when v_command->>'action'='register' then coalesce(v_command->>'provider','expo') else coalesce(v_device.provider,'expo') end,
      case when v_command->>'action'='register' then v_command->>'environment' else v_device.apns_environment end,
      clock_timestamp())
    on conflict(installation_id) do update set actor_id=excluded.actor_id,household_id=excluded.household_id,
      revision=excluded.revision,token=excluded.token,provider=excluded.provider,apns_environment=excluded.apns_environment,registered_at=excluded.registered_at;
  v_receipt:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',v_command->>'operationId','installationId',v_command->>'installationId',
    'expectedRevision',v_expected,'revision',v_revision,'action',v_command->>'action','commandDigest',v_digest);
  insert into private.nest_push_device_operations values(v_actor,p_household,(v_command->>'operationId')::uuid,v_digest,v_receipt);
  return v_receipt;
end;
$$;
revoke all on function private.nest_save_push_device(uuid,jsonb) from public,anon,authenticated,service_role;


create or replace function private.nest_read_push_device_apns(p_household uuid,p_installation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_device private.nest_push_devices; v_result jsonb;
begin
  if p_installation is null then raise exception 'Invalid installation' using errcode='22023'; end if;
  if not exists(select 1 from public.household_members where household_id=p_household and user_id=v_actor) then
    raise exception 'Membership required' using errcode='42501'; end if;
  select * into v_device from private.nest_push_devices where installation_id=p_installation
    and actor_id=v_actor and household_id=p_household;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'installationId',p_installation,'revision',v_device.revision,'enabled',v_device.token is not null);
  if v_device.provider='apns' then
    v_result:=v_result||jsonb_build_object('provider','apns','environment',v_device.apns_environment);
  end if;
  return v_result;
end;
$$;
revoke all on function private.nest_read_push_device_apns(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_push_device_apns(uuid,uuid) to authenticated;

create or replace function public.nest_read_push_device(p_household uuid,p_installation uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_read_push_device_apns(p_household,p_installation);
$$;
revoke all on function public.nest_read_push_device(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_push_device(uuid,uuid) to authenticated;

-- Until the APNs outcome worker is installed, never release an APNs token to
-- the legacy Expo begin RPC. Leave its delivery ready, without an attempt.
alter function private.nest_begin_push_delivery(uuid) rename to nest_begin_expo_push_delivery;
revoke all on function private.nest_begin_expo_push_delivery(uuid) from public,anon,authenticated,service_role;
create function private.nest_begin_push_delivery(p_delivery uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  if exists(select 1 from private.nest_push_deliveries a
    join private.nest_push_devices d on d.installation_id=a.installation_id
    where a.id=p_delivery and d.provider='apns') then return null; end if;
  return private.nest_begin_expo_push_delivery(p_delivery);
end;
$$;
revoke all on function private.nest_begin_push_delivery(uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_begin_push_delivery(uuid) to service_role;
