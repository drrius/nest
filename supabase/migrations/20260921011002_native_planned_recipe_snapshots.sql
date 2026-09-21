-- GATED additive candidate. Captures explicitly selected recipes; no grocery materialization.
create table public.nest_planned_recipe_snapshots (
  household_id uuid not null references public.households(id), entry_id uuid not null,
  library_revision bigint not null check(library_revision>=0), recipe jsonb not null check(jsonb_typeof(recipe)='object'),
  created_at timestamptz not null default clock_timestamp(), primary key(household_id,entry_id),
  foreign key(household_id,entry_id) references public.meal_plan_entries(household_id,id)
);
alter table public.nest_planned_recipe_snapshots enable row level security;
revoke all on public.nest_planned_recipe_snapshots from public,anon,authenticated,service_role;
grant select on public.nest_planned_recipe_snapshots to authenticated;
create policy members_read_planned_recipes on public.nest_planned_recipe_snapshots for select to authenticated
  using((select private.is_household_member(household_id)));
create table public.nest_recipe_selection_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),primary key(actor_id,household_id,operation_id)
);
alter table public.nest_recipe_selection_receipts enable row level security;
revoke all on public.nest_recipe_selection_receipts from public,anon,authenticated,service_role;
grant select on public.nest_recipe_selection_receipts to authenticated;
create policy own_recipe_selection_receipts on public.nest_recipe_selection_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

-- Existing move/remove commands retain their behavior, but a legacy writer cannot rewrite
-- a captured meal's recipe content or reassign the entry to a different household.
create function private.nest_guard_planned_recipe()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if row(new.household_id,new.id,new.meal_definition_id,new.title_snapshot,new.recipe_url_snapshot,new.notes,new.leftover_of_entry_id)
    is distinct from row(old.household_id,old.id,old.meal_definition_id,old.title_snapshot,old.recipe_url_snapshot,old.notes,old.leftover_of_entry_id)
    and exists(select 1 from public.nest_planned_recipe_snapshots where household_id=old.household_id and entry_id=old.id) then
    raise exception 'Planned recipe is immutable; replace the meal' using errcode='40001';
  end if;
  return new;
end;
$$;
revoke all on function private.nest_guard_planned_recipe() from public,anon,authenticated,service_role;
create trigger nest_guard_planned_recipe before update on public.meal_plan_entries
  for each row execute function private.nest_guard_planned_recipe();

create function private.nest_recipe_selection_input(p_input jsonb,p_replace boolean)
returns void language plpgsql immutable set search_path='' as $$
declare v_base jsonb; v_revision bigint;
begin
  if p_replace is null or jsonb_typeof(p_input) is distinct from 'object' then
    raise exception 'Invalid recipe selection' using errcode='22023';
  end if;
  if not(p_input ?& array['definitionId','expectedLibraryRevision'])
    or jsonb_typeof(p_input->'definitionId') is distinct from 'string'
    or p_input->>'definitionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'expectedLibraryRevision') is distinct from 'string'
    or p_input->>'expectedLibraryRevision' !~ '^(0|[1-9][0-9]{0,18})$' or p_input ? 'title' then
    raise exception 'Invalid recipe selection' using errcode='22023';
  end if;
  v_revision:=(p_input->>'expectedLibraryRevision')::bigint;
  v_base:=(p_input-array['definitionId','expectedLibraryRevision'])||jsonb_build_object('title','Selected recipe');
  if p_replace then perform private.nest_meal_replacement_input(v_base);
  else perform private.nest_meal_placement_input(v_base); end if;
exception when numeric_value_out_of_range then
  raise exception 'Invalid recipe selection' using errcode='22023';
end;
$$;

-- Hold the library counter before taking source row locks. NOWAIT makes concurrent legacy
-- row-first updates a recoverable conflict, not a mixed recipe or a lock-order deadlock.
create function private.nest_capture_recipe(p_household uuid,p_definition uuid,p_revision text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_revision bigint; v_result jsonb;
begin
  insert into public.nest_meal_library_revisions(household_id,revision) values(p_household,0)
    on conflict(household_id) do nothing;
  select revision into v_revision from public.nest_meal_library_revisions where household_id=p_household for update;
  if v_revision<>p_revision::bigint then raise exception 'Meal library changed' using errcode='40001'; end if;
  perform 1 from public.meal_definitions where household_id=p_household and id=p_definition and archived_at is null for share nowait;
  if not found then raise exception 'Saved recipe changed' using errcode='40001'; end if;
  perform 1 from public.meal_grocery_templates where household_id=p_household and meal_definition_id=p_definition
    and archived_at is null order by id for share nowait;
  v_result:=private.nest_saved_meal(p_household,p_definition,p_revision)->'recipe';
  if v_result is null or v_result='null'::jsonb then raise exception 'Saved recipe changed' using errcode='40001'; end if;
  return v_result;
end;
$$;
create function private.nest_lock_recipe_destination(p_household uuid,p_input jsonb,p_replace boolean)
returns void language plpgsql security invoker set search_path='' as $$
declare v_week date:=(p_input->>'weekStart')::date; v_revision bigint; v_entry public.meal_plan_entries;
begin
  insert into public.nest_meal_week_revisions(household_id,week_start,revision) values(p_household,v_week,0)
    on conflict(household_id,week_start) do nothing;
  select revision into v_revision from public.nest_meal_week_revisions
    where household_id=p_household and week_start=v_week for update;
  if v_revision<>(p_input->>'expectedRevision')::bigint then raise exception 'Meal week changed' using errcode='40001'; end if;
  if p_replace then
    select * into v_entry from public.meal_plan_entries where household_id=p_household and id=(p_input->>'entryId')::uuid for update nowait;
    if not found or v_entry.removed_at is not null or v_entry.date<>(p_input->>'date')::date
      or v_entry.slot is distinct from p_input->>'slot' then raise exception 'Meal slot changed' using errcode='40001'; end if;
  elsif exists(select 1 from public.meal_plan_entries where household_id=p_household and date=(p_input->>'date')::date
    and slot=p_input->>'slot' and removed_at is null) then raise exception 'Meal slot occupied' using errcode='40001'; end if;
end;
$$;
create function private.nest_insert_selected_recipe(p_household uuid,p_input jsonb,p_recipe jsonb,p_replace boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_removed jsonb; v_entry uuid; v_revision bigint; v_result jsonb;
begin
  if p_replace then
    v_removed:=private.nest_remove_meal(p_household,gen_random_uuid(),jsonb_build_object('entryId',lower(p_input->>'entryId'),
      'weekStart',p_input->>'weekStart','expectedRevision',p_input->>'expectedRevision'));
  end if;
  insert into public.meal_plan_entries(household_id,date,slot,meal_definition_id,title_snapshot,recipe_url_snapshot,notes)
    values(p_household,(p_input->>'date')::date,p_input->>'slot',(p_recipe->>'definitionId')::uuid,
      p_recipe->>'title',p_recipe->>'recipeUrl',p_recipe->>'notes') returning id into v_entry;
  insert into public.nest_planned_recipe_snapshots(household_id,entry_id,library_revision,recipe)
    values(p_household,v_entry,(p_input->>'expectedLibraryRevision')::bigint,p_recipe);
  select revision into v_revision from public.nest_meal_week_revisions
    where household_id=p_household and week_start=(p_input->>'weekStart')::date;
  v_result:=jsonb_build_object('entryId',v_entry,'definitionId',p_recipe->>'definitionId',
    'libraryRevision',p_input->>'expectedLibraryRevision','weekStart',p_input->>'weekStart','date',p_input->>'date',
    'slot',p_input->>'slot','revision',v_revision::text);
  if p_replace then v_result:=v_result||jsonb_build_object('previousEntryId',lower(p_input->>'entryId'),
    'skippedPreparationId',v_removed->'skippedPreparationId'); end if;
  return v_result;
end;
$$;
create function private.nest_select_recipe(p_household uuid,p_operation uuid,p_input jsonb,p_replace boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_prior public.nest_recipe_selection_receipts; v_hash bytea; v_recipe jsonb; v_result jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid recipe operation' using errcode='22023'; end if;
  perform private.nest_recipe_selection_input(p_input,p_replace);
  perform pg_advisory_xact_lock(hashtextextended('nest:recipe-select:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(jsonb_build_object('replace',p_replace,'input',p_input)::text,'UTF8'));
  select * into v_prior from public.nest_recipe_selection_receipts where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Recipe operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Meal week changed' using errcode='40001'; end if;
  v_recipe:=private.nest_capture_recipe(p_household,(p_input->>'definitionId')::uuid,p_input->>'expectedLibraryRevision');
  perform private.nest_lock_recipe_destination(p_household,p_input,p_replace);
  v_result:=private.nest_insert_selected_recipe(p_household,p_input,v_recipe,p_replace)||
    jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,'operationId',p_operation);
  insert into public.nest_recipe_selection_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when unique_violation or lock_not_available or deadlock_detected or numeric_value_out_of_range then
  raise exception 'Meal or recipe changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_recipe_selection_input(jsonb,boolean),private.nest_capture_recipe(uuid,uuid,text),
  private.nest_lock_recipe_destination(uuid,jsonb,boolean),private.nest_insert_selected_recipe(uuid,jsonb,jsonb,boolean),
  private.nest_select_recipe(uuid,uuid,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function private.nest_select_recipe(uuid,uuid,jsonb,boolean) to authenticated;
create function public.nest_place_recipe(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_select_recipe($1,$2,$3,false); $$;
create function public.nest_replace_with_recipe(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_select_recipe($1,$2,$3,true); $$;
revoke all on function public.nest_place_recipe(uuid,uuid,jsonb),public.nest_replace_with_recipe(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_place_recipe(uuid,uuid,jsonb),public.nest_replace_with_recipe(uuid,uuid,jsonb) to authenticated;

create function private.nest_planned_recipe(p_household uuid,p_week text,p_revision text,p_entry uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_week jsonb; v_entry jsonb; v_snapshot jsonb;
begin
  v_week:=private.nest_meal_week_snapshot(p_household,p_week);
  if p_entry is null or p_revision is null or p_revision !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'Invalid planned recipe request' using errcode='22023'; end if;
  if p_revision::bigint<>(v_week->>'revision')::bigint then raise exception 'Meal week changed' using errcode='40001'; end if;
  select value into v_entry from jsonb_array_elements(v_week->'entries') where value->>'entryId'=p_entry::text;
  if v_entry is not null then
    select jsonb_build_object('libraryRevision',library_revision::text,'recipe',recipe) into v_snapshot
      from public.nest_planned_recipe_snapshots where household_id=p_household and entry_id=p_entry;
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,'weekStart',p_week,'revision',p_revision,'entry',v_entry,'snapshot',v_snapshot);
exception when numeric_value_out_of_range then raise exception 'Invalid planned recipe request' using errcode='22023';
end;
$$;
revoke all on function private.nest_planned_recipe(uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_planned_recipe(uuid,text,text,uuid) to authenticated;
create function public.nest_planned_recipe(p_household uuid,p_week text,p_revision text,p_entry uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.nest_planned_recipe($1,$2,$3,$4); $$;
revoke all on function public.nest_planned_recipe(uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.nest_planned_recipe(uuid,text,text,uuid) to authenticated;
