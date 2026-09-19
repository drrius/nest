create function public.fixture_execute(p_id uuid, p_household uuid, p_invocation uuid,
  p_command text, p_version integer, p_payload jsonb, p_fail boolean default false)
  returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.nest_consume_action_approval(p_id,p_household,p_invocation,p_command,p_version,p_payload);
  insert into private.fixture_writes values(p_invocation,p_payload);
  if p_fail then raise exception 'Fixture write failure'; end if;
end;
$$;
revoke all on function public.fixture_execute(uuid,uuid,uuid,text,integer,jsonb,boolean) from public, anon;
grant execute on function public.fixture_execute(uuid,uuid,uuid,text,integer,jsonb,boolean) to authenticated;
