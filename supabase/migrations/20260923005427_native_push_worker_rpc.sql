-- Server-only RPC boundary. No scheduler, HTTP dispatch or deployment is activated.
grant execute on function private.nest_begin_push_delivery(uuid) to service_role;
create function public.nest_begin_push_delivery(p_delivery uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_begin_push_delivery($1);
$$;
revoke all on function public.nest_begin_push_delivery(uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_begin_push_delivery(uuid) to service_role;

grant execute on function private.nest_finish_push_send(uuid,uuid,jsonb) to service_role;
create function public.nest_finish_push_send(p_delivery uuid,p_attempt uuid,p_result jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_finish_push_send($1,$2,$3);
$$;
revoke all on function public.nest_finish_push_send(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_finish_push_send(uuid,uuid,jsonb) to service_role;

grant execute on function private.nest_finish_push_receipt(uuid,uuid,text,jsonb) to service_role;
create function public.nest_finish_push_receipt(p_delivery uuid,p_attempt uuid,p_ticket text,p_result jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_finish_push_receipt($1,$2,$3,$4);
$$;
revoke all on function public.nest_finish_push_receipt(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_finish_push_receipt(uuid,uuid,text,jsonb) to service_role;

grant execute on function private.nest_claim_push_receipt_polls() to service_role;
create function public.nest_claim_push_receipt_polls()
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_claim_push_receipt_polls();
$$;
revoke all on function public.nest_claim_push_receipt_polls() from public,anon,authenticated,service_role;
grant execute on function public.nest_claim_push_receipt_polls() to service_role;

grant execute on function private.nest_retry_push_delivery(uuid) to service_role;
create function public.nest_retry_push_delivery(p_delivery uuid)
returns boolean language sql security invoker set search_path='' as $$
  select private.nest_retry_push_delivery($1);
$$;
revoke all on function public.nest_retry_push_delivery(uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_retry_push_delivery(uuid) to service_role;

