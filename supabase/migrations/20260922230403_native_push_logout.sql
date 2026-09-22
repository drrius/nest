-- Gated: no hosted migration or notification delivery is activated.
alter table private.nest_push_devices add column session_id uuid;
-- Existing enrollments have no provable session owner; require explicit fresh
-- enrollment when this gated migration is eventually applied.
update private.nest_push_devices set token=null,revision=gen_random_uuid() where token is not null;
create table private.nest_push_revoked_sessions (
  actor_id uuid not null references auth.users(id), session_id uuid not null,
  primary key(actor_id,session_id)
);
alter table private.nest_push_revoked_sessions enable row level security;
revoke all on private.nest_push_revoked_sessions from public,anon,authenticated,service_role;

create function private.nest_push_session()
returns uuid language plpgsql stable set search_path='' as $$
declare v_session uuid;
begin
  v_session:=nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id';
  if auth.uid() is null or v_session is null then
    raise exception 'Authenticated session required' using errcode='42501'; end if;
  return v_session;
end;
$$;
revoke all on function private.nest_push_session() from public,anon,authenticated,service_role;

-- Preserve the audited command transaction behind a session-fenced public entry.
alter function public.nest_save_push_device(uuid,jsonb) set schema private;
revoke all on function private.nest_save_push_device(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.nest_save_push_device(p_household uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_session uuid:=private.nest_push_session();
  v_command jsonb; v_replay boolean; v_receipt jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  if exists(select 1 from private.nest_push_revoked_sessions
    where actor_id=v_actor and session_id=v_session) then
    raise exception 'Push session revoked' using errcode='42501'; end if;
  v_command:=private.nest_push_device_command(p_input);
  select exists(select 1 from private.nest_push_device_operations where actor_id=v_actor
    and household_id=p_household and operation_id=(v_command->>'operationId')::uuid) into v_replay;
  v_receipt:=private.nest_save_push_device(p_household,v_command);
  if not v_replay then
    update private.nest_push_devices set session_id=v_session
      where installation_id=(v_command->>'installationId')::uuid;
  end if;
  return v_receipt;
end;
$$;
revoke all on function public.nest_save_push_device(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_push_device(uuid,jsonb) to authenticated;

-- Revocation is session-wide: a delayed request cannot escape with another
-- installation ID. A retry cannot disable a newer sign-in's registration.
-- Membership is deliberately not required to stop this caller's notifications.
create function public.nest_revoke_push_session()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_session uuid:=private.nest_push_session();
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  insert into private.nest_push_revoked_sessions values(v_actor,v_session) on conflict do nothing;
  update private.nest_push_devices set token=null,revision=gen_random_uuid()
    where actor_id=v_actor and session_id=v_session and token is not null;
  return jsonb_build_object('version',1,'actorId',v_actor,'sessionId',v_session,'revoked',true);
end;
$$;
revoke all on function public.nest_revoke_push_session() from public,anon,authenticated,service_role;
grant execute on function public.nest_revoke_push_session() to authenticated;
