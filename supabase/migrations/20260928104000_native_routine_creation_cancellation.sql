-- GATED: additive recovery for uncertain creates. Never deletes a recorded routine.
create table private.nest_routine_creation_cancellations (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32),
  primary key(actor_id,household_id,operation_id)
);
revoke all on private.nest_routine_creation_cancellations from public,anon,authenticated;

alter function private.nest_create_routine(uuid,uuid,jsonb) rename to nest_create_routine_before_cancellation;
revoke all on function private.nest_create_routine_before_cancellation(uuid,uuid,jsonb) from public,anon,authenticated;

create function private.nest_create_routine(p_household uuid,p_operation uuid,p_definition jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_cancel bytea;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:routine-create:'||p_household::text,0));
  select request_hash into v_cancel from private.nest_routine_creation_cancellations
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_cancel<>sha256(convert_to(p_definition::text,'UTF8')) then
      raise exception 'Routine operation changed' using errcode='22023';
    end if;
    raise exception 'Routine creation cancelled' using errcode='22023';
  end if;
  return private.nest_create_routine_before_cancellation(p_household,p_operation,p_definition);
end;
$$;
revoke all on function private.nest_create_routine(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.nest_create_routine(uuid,uuid,jsonb) to authenticated;

create function public.nest_cancel_routine_creation(p_household uuid,p_operation uuid,p_definition jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_routine_creation_receipts;
  v_cancel bytea; v_status text; v_receipt jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_definition is null or jsonb_typeof(p_definition)<>'object'
    or octet_length(p_definition::text)>8192 then
    raise exception 'Invalid routine command' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('nest:routine-create:'||p_household::text,0));
  v_hash:=sha256(convert_to(p_definition::text,'UTF8'));
  select * into v_prior from public.nest_routine_creation_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Routine operation changed' using errcode='22023'; end if;
    v_status:='recorded'; v_receipt:=v_prior.result;
  else
    select request_hash into v_cancel from private.nest_routine_creation_cancellations
      where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
    if found and v_cancel<>v_hash then raise exception 'Routine operation changed' using errcode='22023'; end if;
    insert into private.nest_routine_creation_cancellations values(v_actor,p_household,p_operation,v_hash)
      on conflict do nothing;
    v_status:='cancelled';
  end if;
  return jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'status',v_status,'receipt',v_receipt);
end;
$$;
revoke all on function public.nest_cancel_routine_creation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nest_cancel_routine_creation(uuid,uuid,jsonb) to authenticated;
