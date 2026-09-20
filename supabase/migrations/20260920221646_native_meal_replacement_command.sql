-- GATED candidate: one atomic replacement, retaining the original meal and preparation history.
create table public.nest_meal_replacement_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_meal_replacement_receipts enable row level security;
revoke all on public.nest_meal_replacement_receipts from public,anon,authenticated,service_role;
grant select on public.nest_meal_replacement_receipts to authenticated;
create policy own_meal_replacement_receipts on public.nest_meal_replacement_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_meal_replacement_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
begin
  perform private.nest_meal_placement_input(p_input-'entryId');
  if jsonb_typeof(p_input->'entryId') is distinct from 'string'
    or p_input->>'entryId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or (p_input->>'expectedRevision')::bigint>9223372036854775805 then
    raise exception 'Invalid meal replacement' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.nest_meal_replacement_input(jsonb) from public,anon,authenticated,service_role;

-- Membership, current week and exact source slot are locked by the caller.
-- Server-generated child operation identities cannot reuse a caller-selected old receipt.
create function private.nest_replace_meal_entries(p_household uuid,p_input jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare v_removed jsonb; v_placed jsonb;
begin
  v_removed:=private.nest_remove_meal(p_household,gen_random_uuid(),
    jsonb_build_object('entryId',lower(p_input->>'entryId'),'weekStart',p_input->>'weekStart',
      'expectedRevision',p_input->>'expectedRevision'));
  v_placed:=private.nest_place_meal(p_household,gen_random_uuid(),
    jsonb_set(p_input-'entryId','{expectedRevision}',to_jsonb(((p_input->>'expectedRevision')::bigint+1)::text)));
  return v_placed||jsonb_build_object('previousEntryId',lower(p_input->>'entryId'),
    'skippedPreparationId',v_removed->'skippedPreparationId');
end;
$$;
revoke all on function private.nest_replace_meal_entries(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.nest_replace_meal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_meal_replacement_receipts;
  v_week date; v_revision bigint; v_entry public.meal_plan_entries; v_result jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid meal operation' using errcode='22023'; end if;
  perform private.nest_meal_replacement_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:meal-replace:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(p_input::text,'UTF8'));
  select * into v_prior from public.nest_meal_replacement_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Meal operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Meal week changed' using errcode='40001';
  end if;
  v_week:=(p_input->>'weekStart')::date;
  insert into public.nest_meal_week_revisions(household_id,week_start,revision)
    values(p_household,v_week,0) on conflict(household_id,week_start) do nothing;
  select revision into v_revision from public.nest_meal_week_revisions
    where household_id=p_household and week_start=v_week for update;
  if v_revision<>(p_input->>'expectedRevision')::bigint then
    raise exception 'Meal week changed' using errcode='40001';
  end if;
  select * into v_entry from public.meal_plan_entries
    where household_id=p_household and id=(p_input->>'entryId')::uuid for update;
  if not found or v_entry.removed_at is not null or v_entry.date<>(p_input->>'date')::date
    or v_entry.slot is distinct from p_input->>'slot' then
    raise exception 'Meal slot changed' using errcode='40001';
  end if;
  v_result:=private.nest_replace_meal_entries(p_household,p_input)||jsonb_build_object('operationId',p_operation);
  insert into public.nest_meal_replacement_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when check_violation or unique_violation or lock_not_available or deadlock_detected then
  raise exception 'Meal week changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_replace_meal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_replace_meal(uuid,uuid,jsonb) to authenticated;
create function public.nest_replace_meal(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_replace_meal($1,$2,$3);
$$;
revoke all on function public.nest_replace_meal(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_replace_meal(uuid,uuid,jsonb) to authenticated;
