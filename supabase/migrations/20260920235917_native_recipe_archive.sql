-- GATED additive candidate. Hide a library definition; retain ingredients and planned history.
create table public.nest_recipe_archive_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_recipe_archive_receipts enable row level security;
revoke all on public.nest_recipe_archive_receipts from public,anon,authenticated,service_role;
grant select on public.nest_recipe_archive_receipts to authenticated;
create policy own_recipe_archive_receipts on public.nest_recipe_archive_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_recipe_archive_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_input) is distinct from 'object'
    or not(p_input ?& array['definitionId','expectedRevision'])
    or p_input-array['definitionId','expectedRevision']<>'{}'::jsonb
    or jsonb_typeof(p_input->'definitionId') is distinct from 'string'
    or p_input->>'definitionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'expectedRevision') is distinct from 'string'
    or p_input->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'Invalid recipe archive' using errcode='22023';
  end if;
  if (p_input->>'expectedRevision')::bigint>=9223372036854775807 then
    raise exception 'Invalid recipe archive revision' using errcode='22023';
  end if;
exception when numeric_value_out_of_range then
  raise exception 'Invalid recipe archive revision' using errcode='22023';
end;
$$;
revoke all on function private.nest_recipe_archive_input(jsonb) from public,anon,authenticated,service_role;

create function private.nest_archive_recipe(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_recipe_archive_receipts;
  v_revision bigint; v_definition uuid; v_result jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid recipe operation' using errcode='22023'; end if;
  perform private.nest_recipe_archive_input(p_input);
  v_definition:=(p_input->>'definitionId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('nest:recipe-archive:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(p_input::text,'UTF8'));
  select * into v_prior from public.nest_recipe_archive_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Recipe operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'Meal library changed' using errcode='40001';
  end if;
  insert into public.nest_meal_library_revisions(household_id,revision)
    values(p_household,0) on conflict(household_id) do nothing;
  select revision into v_revision from public.nest_meal_library_revisions where household_id=p_household for update;
  if v_revision<>(p_input->>'expectedRevision')::bigint then
    raise exception 'Meal library changed' using errcode='40001';
  end if;
  perform 1 from public.meal_definitions where id=v_definition and household_id=p_household
    and archived_at is null for update nowait;
  if not found then raise exception 'Recipe changed' using errcode='40001'; end if;
  update public.meal_definitions set archived_at=clock_timestamp() where id=v_definition and household_id=p_household;
  select revision into v_revision from public.nest_meal_library_revisions where household_id=p_household;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'definitionId',v_definition,'revision',v_revision::text);
  insert into public.nest_recipe_archive_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when unique_violation or lock_not_available or deadlock_detected then
  raise exception 'Meal library changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_archive_recipe(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_archive_recipe(uuid,uuid,jsonb) to authenticated;
create function public.nest_archive_recipe(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_archive_recipe($1,$2,$3);
$$;
revoke all on function public.nest_archive_recipe(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_archive_recipe(uuid,uuid,jsonb) to authenticated;
