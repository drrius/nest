create function public.nest_grocery_epoch_snapshot(p_household uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_grocery_snapshot($1) || private.nest_offline_epoch_snapshot($1);
$$;
revoke all on function public.nest_grocery_epoch_snapshot(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.nest_grocery_epoch_snapshot(uuid) to authenticated;
