-- GATED bounded preparation only. Hosting must explicitly schedule worker invocations.
create function private.nest_maintain_daily_summaries()
returns jsonb language sql volatile security definer set search_path='' as $$
  select private.nest_materialize_daily_summaries((clock_timestamp() at time zone 'Europe/Zurich')::date);
$$;
revoke all on function private.nest_maintain_daily_summaries() from public,anon,authenticated,service_role;
grant execute on function private.nest_maintain_daily_summaries() to service_role;
create function public.nest_maintain_daily_summaries()
returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.nest_maintain_daily_summaries();
$$;
revoke all on function public.nest_maintain_daily_summaries() from public,anon,authenticated,service_role;
grant execute on function public.nest_maintain_daily_summaries() to service_role;
