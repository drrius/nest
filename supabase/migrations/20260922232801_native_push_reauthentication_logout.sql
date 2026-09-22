-- Gated recovery: fresh authentication can stop an older session belonging to
-- the same user. No target user ID or household authority is caller-supplied.
create function private.nest_revoke_owned_push_session(p_session uuid)
returns jsonb language plpgsql set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  perform private.nest_push_session();
  if p_session is null then raise exception 'Session required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  insert into private.nest_push_revoked_sessions values(v_actor,p_session) on conflict do nothing;
  update private.nest_push_devices set token=null,revision=gen_random_uuid()
    where actor_id=v_actor and session_id=p_session and token is not null;
  return jsonb_build_object('version',1,'actorId',v_actor,'sessionId',p_session,'revoked',true);
end;
$$;
revoke all on function private.nest_revoke_owned_push_session(uuid) from public,anon,authenticated,service_role;

create or replace function public.nest_revoke_push_session()
returns jsonb language sql security definer set search_path='' as $$
  select private.nest_revoke_owned_push_session(private.nest_push_session());
$$;
revoke all on function public.nest_revoke_push_session() from public,anon,authenticated,service_role;
grant execute on function public.nest_revoke_push_session() to authenticated;

create function public.nest_revoke_previous_push_session(p_session uuid)
returns jsonb language sql security definer set search_path='' as $$
  select private.nest_revoke_owned_push_session(p_session);
$$;
revoke all on function public.nest_revoke_previous_push_session(uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_revoke_previous_push_session(uuid) to authenticated;
