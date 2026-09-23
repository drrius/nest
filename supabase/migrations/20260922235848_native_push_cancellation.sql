-- Gated local development only. Does not activate hosted enrollment or delivery.
create table private.nest_push_cancelled_operations (
  actor_id uuid not null references auth.users(id),
  household_id uuid not null references public.households(id),
  operation_id uuid not null,
  primary key(actor_id,household_id,operation_id)
);
alter table private.nest_push_cancelled_operations enable row level security;
revoke all on private.nest_push_cancelled_operations from public,anon,authenticated,service_role;
create trigger nest_push_cancelled_operations_immutable before update or delete on private.nest_push_cancelled_operations
  for each row execute function private.reject_financial_history_change();

-- Preserve the existing session fence and command transaction behind this fence.
alter function public.nest_save_push_device(uuid,jsonb) rename to nest_save_push_device_session;
alter function public.nest_save_push_device_session(uuid,jsonb) set schema private;
revoke all on function private.nest_save_push_device_session(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.nest_save_push_device(p_household uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_command jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Membership required' using errcode='42501'; end if;
  v_command:=private.nest_push_device_command(p_input);
  if exists(select 1 from private.nest_push_cancelled_operations where actor_id=v_actor
    and household_id=p_household and operation_id=(v_command->>'operationId')::uuid) then
    raise exception 'Device operation cancelled' using errcode='40001'; end if;
  return private.nest_save_push_device_session(p_household,v_command);
end;
$$;
revoke all on function public.nest_save_push_device(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_save_push_device(uuid,jsonb) to authenticated;

create or replace function public.nest_read_push_device_operation(p_household uuid,p_operation uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_receipt jsonb; v_status text;
begin
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  if not exists(select 1 from public.household_members where household_id=p_household and user_id=v_actor) then
    raise exception 'Membership required' using errcode='42501'; end if;
  select receipt into v_receipt from private.nest_push_device_operations
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  v_status:=case when v_receipt is not null then 'recorded'
    when exists(select 1 from private.nest_push_cancelled_operations where actor_id=v_actor
      and household_id=p_household and operation_id=p_operation) then 'cancelled' else 'unresolved' end;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'status',v_status,'receipt',v_receipt);
end;
$$;

create function public.nest_cancel_push_device_operation(p_household uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();
begin
  if p_operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:push-device-enrollment',0));
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Membership required' using errcode='42501'; end if;
  -- A committed change remains committed. Cancellation only fences unsaved intent.
  if not exists(select 1 from private.nest_push_device_operations where actor_id=v_actor
    and household_id=p_household and operation_id=p_operation) then
    insert into private.nest_push_cancelled_operations values(v_actor,p_household,p_operation)
      on conflict do nothing;
  end if;
  return public.nest_read_push_device_operation(p_household,p_operation);
end;
$$;
revoke all on function public.nest_cancel_push_device_operation(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_cancel_push_device_operation(uuid,uuid) to authenticated;
