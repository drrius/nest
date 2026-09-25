-- GATED additive adapter. Old clients remain compatible until explicit epoch rotation.
-- Copy the audited implementation, preserving the original function OID so existing
-- callers are replaced in place rather than retaining a reference to an unfenced core.
do $copy$ begin
  execute replace(pg_get_functiondef(
    'private.nest_set_grocery_checked(uuid,uuid,uuid,bigint,boolean)'::regprocedure),
    'FUNCTION private.nest_set_grocery_checked(',
    'FUNCTION private.nest_set_grocery_checked_before_epoch(');
end; $copy$;
revoke all on function private.nest_set_grocery_checked_before_epoch(uuid,uuid,uuid,bigint,boolean)
  from public,anon,authenticated,service_role;

create function private.nest_check_grocery_at_epoch(
  p_household uuid, p_command jsonb, p_epoch uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := auth.uid(); v_operation uuid; v_target uuid;
  v_expected bigint; v_checked boolean;
begin
  perform 1 from public.household_members
    where user_id=v_actor and household_id=p_household for key share;
  if v_actor is null or not found then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_command is null or jsonb_typeof(p_command)<>'object'
    or p_command - array['operationId','itemId','expectedVersion','checked'] <> '{}'::jsonb
    or jsonb_typeof(p_command->'checked') is distinct from 'boolean' then
    raise exception 'Invalid check request' using errcode='22023';
  end if;
  v_operation := (p_command->>'operationId')::uuid;
  v_target := (p_command->>'itemId')::uuid;
  v_expected := (p_command->>'expectedVersion')::bigint;
  v_checked := (p_command->>'checked')::boolean;
  if v_operation is null or v_target is null or v_expected is null or v_expected<1 then
    raise exception 'Invalid check request' using errcode='22023';
  end if;
  -- Same operation lock as the retained implementation: absence cannot race a commit.
  perform pg_advisory_xact_lock(hashtextextended(
    v_actor::text || ':' || p_household::text || ':' || v_operation::text,0));
  if not exists(select 1 from public.nest_grocery_check_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=v_operation) then
    perform private.nest_require_offline_epoch(p_epoch);
  end if;
  -- The retained implementation rechecks membership and the complete original payload
  -- before returning any historical receipt. A stale epoch cannot alter that receipt.
  return private.nest_set_grocery_checked_before_epoch(
    p_household,v_operation,v_target,v_expected,v_checked);
end;
$$;
revoke all on function private.nest_check_grocery_at_epoch(uuid,jsonb,uuid)
  from public,anon,authenticated,service_role;
grant execute on function private.nest_check_grocery_at_epoch(uuid,jsonb,uuid) to authenticated;

create function public.nest_check_grocery_at_epoch(
  p_household uuid, p_command jsonb, p_epoch uuid
) returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_check_grocery_at_epoch($1,$2,$3);
$$;
revoke all on function public.nest_check_grocery_at_epoch(uuid,jsonb,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.nest_check_grocery_at_epoch(uuid,jsonb,uuid) to authenticated;

-- Keep the old signatures as receipt recovery/compatibility adapters, never a bypass.
create or replace function private.nest_set_grocery_checked(
  p_household uuid, p_operation uuid, p_target uuid, p_expected bigint, p_checked boolean
) returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_check_grocery_at_epoch($1,jsonb_build_object(
    'operationId',$2,'itemId',$3,'expectedVersion',$4::text,'checked',$5),null);
$$;
revoke all on function private.nest_set_grocery_checked(uuid,uuid,uuid,bigint,boolean)
  from public,anon,authenticated,service_role;
grant execute on function private.nest_set_grocery_checked(uuid,uuid,uuid,bigint,boolean)
  to authenticated;
