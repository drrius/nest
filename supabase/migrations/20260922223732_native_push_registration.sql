-- GATED private validation only. No token enrollment or delivery is activated.
create function private.nest_push_device_command(p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_action text; v_command jsonb; v_token text;
begin
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or octet_length(p_input::text)>32768
    or not(p_input ?& array['operationId','installationId','expectedRevision','action'])
    or jsonb_typeof(p_input->'action') is distinct from 'string' then
    raise exception 'Invalid device command' using errcode='22023'; end if;
  v_action:=p_input->>'action';
  if v_action not in ('register','disable')
    or p_input-array['operationId','installationId','expectedRevision','action','token']<>'{}'::jsonb
    or (v_action='disable' and p_input ? 'token') then
    raise exception 'Invalid device action' using errcode='22023'; end if;
  v_command:=jsonb_build_object('operationId',private.nest_expense_uuid(p_input->'operationId',false),
    'installationId',private.nest_expense_uuid(p_input->'installationId',false),
    'expectedRevision',private.nest_expense_uuid(p_input->'expectedRevision',true),'action',v_action);
  if v_action='register' then
    v_token:=p_input->>'token';
    if jsonb_typeof(p_input->'token') is distinct from 'string' or length(v_token) not between 1 and 4096
      or v_token collate "C" !~'^[!-~]+$' then
      raise exception 'Invalid device token' using errcode='22023'; end if;
    v_command:=v_command||jsonb_build_object('token',v_token);
  end if;
  return v_command;
end;
$$;
revoke all on function private.nest_push_device_command(jsonb) from public,anon,authenticated,service_role;

create function private.nest_push_device_digest(p_command jsonb,p_actor uuid,p_household uuid)
returns text language plpgsql immutable set search_path='' as $$
declare v_command jsonb;
begin
  if p_actor is null or p_household is null then
    raise exception 'Missing device identity' using errcode='22023'; end if;
  v_command:=private.nest_push_device_command(p_command);
  return encode(extensions.digest(convert_to(array_to_string(array[
    'nest-push-device/v1',p_actor::text,p_household::text,v_command->>'operationId',
    v_command->>'installationId',coalesce(v_command->>'expectedRevision',''),
    v_command->>'action',coalesce(v_command->>'token','')],E'\n'),'UTF8'),'sha256'),'hex');
end;
$$;
revoke all on function private.nest_push_device_digest(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create table private.nest_push_devices (
  installation_id uuid primary key,
  actor_id uuid not null references auth.users(id), household_id uuid not null references public.households(id),
  revision uuid not null, token text,
  token_hash text generated always as (encode(extensions.digest(token,'sha256'),'hex')) stored,
  check(token is null or (length(token) between 1 and 4096 and token collate "C" ~'^[!-~]+$'))
);
create unique index nest_push_device_active_token on private.nest_push_devices(token_hash) where token is not null;
alter table private.nest_push_devices enable row level security;
revoke all on private.nest_push_devices from public,anon,authenticated,service_role;
create table private.nest_push_device_operations (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  command_digest text not null, receipt jsonb not null,
  primary key(actor_id,household_id,operation_id)
);
alter table private.nest_push_device_operations enable row level security;
revoke all on private.nest_push_device_operations from public,anon,authenticated,service_role;

create function public.nest_save_push_device(p_household uuid,p_input jsonb)
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
    raise exception 'Device registration changed' using errcode='40001';
  end if;
  insert into private.nest_push_devices(installation_id,actor_id,household_id,revision,token)
    values((v_command->>'installationId')::uuid,v_actor,p_household,v_revision,v_command->>'token')
    on conflict(installation_id) do update set actor_id=excluded.actor_id,household_id=excluded.household_id,
      revision=excluded.revision,token=excluded.token;
  v_receipt:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',v_command->>'operationId','installationId',v_command->>'installationId',
    'expectedRevision',v_expected,'revision',v_revision,'action',v_command->>'action','commandDigest',v_digest);
  insert into private.nest_push_device_operations values(v_actor,p_household,(v_command->>'operationId')::uuid,v_digest,v_receipt);
  return v_receipt;
end;
$$;
revoke all on function public.nest_save_push_device(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_push_device(uuid,jsonb) to authenticated;

create trigger nest_push_device_operations_immutable before update or delete on private.nest_push_device_operations
  for each row execute function private.reject_financial_history_change();

create function public.nest_read_push_device(p_household uuid,p_installation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_device private.nest_push_devices;
begin
  if p_installation is null then raise exception 'Invalid installation' using errcode='22023'; end if;
  if not exists(select 1 from public.household_members where household_id=p_household and user_id=v_actor) then
    raise exception 'Membership required' using errcode='42501'; end if;
  select * into v_device from private.nest_push_devices where installation_id=p_installation
    and actor_id=v_actor and household_id=p_household;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'installationId',p_installation,'revision',v_device.revision,'enabled',v_device.token is not null);
end;
$$;
revoke all on function public.nest_read_push_device(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_push_device(uuid,uuid) to authenticated;

create function public.nest_read_push_device_operation(p_household uuid,p_operation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_receipt jsonb;
begin
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  if not exists(select 1 from public.household_members where household_id=p_household and user_id=v_actor) then
    raise exception 'Membership required' using errcode='42501'; end if;
  select receipt into v_receipt from private.nest_push_device_operations
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation,
    'status',case when v_receipt is null then 'unresolved' else 'recorded' end,'receipt',v_receipt);
end;
$$;
revoke all on function public.nest_read_push_device_operation(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_push_device_operation(uuid,uuid) to authenticated;
