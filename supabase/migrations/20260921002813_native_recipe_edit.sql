-- GATED additive candidate. Patch recipes without rewriting planned or grocery history.
create table public.nest_recipe_edit_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_recipe_edit_receipts enable row level security;
revoke all on public.nest_recipe_edit_receipts from public,anon,authenticated,service_role;
grant select on public.nest_recipe_edit_receipts to authenticated;
create policy own_recipe_edit_receipts on public.nest_recipe_edit_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_recipe_metadata_patch(p_patch jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_servings numeric;
begin
  if jsonb_typeof(p_patch) is distinct from 'object'
    or p_patch-array['title','servings','instructions','recipeUrl','notes']<>'{}'::jsonb then
    raise exception 'Invalid recipe patch' using errcode='22023';
  end if;
  if p_patch ? 'title' then perform private.nest_recipe_text(p_patch->'title',120,false); end if;
  if p_patch ? 'instructions' then perform private.nest_recipe_text(p_patch->'instructions',4000,true); end if;
  if p_patch ? 'notes' then perform private.nest_recipe_text(p_patch->'notes',4000,true); end if;
  if p_patch ? 'recipeUrl' then perform private.nest_recipe_source(p_patch->'recipeUrl'); end if;
  if p_patch ? 'servings' and p_patch->'servings'<>'null'::jsonb then
    if jsonb_typeof(p_patch->'servings') is distinct from 'number' then
      raise exception 'Invalid recipe servings' using errcode='22023';
    end if;
    v_servings:=(p_patch->>'servings')::numeric;
    if v_servings<1 or v_servings>2147483647 or trunc(v_servings)<>v_servings then
      raise exception 'Invalid recipe servings' using errcode='22023';
    end if;
  end if;
end;
$$;

create function private.nest_recipe_ingredient_patch(p_patch jsonb)
returns void language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_patch) is distinct from 'object'
    or p_patch-array['name','quantity','unit','categoryId','note']<>'{}'::jsonb then
    raise exception 'Invalid ingredient patch' using errcode='22023';
  end if;
  -- Fill only the validator's omitted keys; these defaults never reach storage.
  perform private.nest_recipe_ingredient_input(
    jsonb_build_object('name','unchanged','quantity',null,'unit',null,'categoryId',null,'note',null)||p_patch);
end;
$$;

create function private.nest_recipe_edit_selection(p_items jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_item jsonb; v_count integer; v_unique integer;
begin
  if p_items='null'::jsonb then return; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>200 then
    raise exception 'Invalid recipe selection' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if v_item->>'kind'='new' then
      perform private.nest_recipe_ingredient_input(v_item-'kind');
    elsif v_item->>'kind'='existing' then
      if jsonb_typeof(v_item) is distinct from 'object'
        or not(v_item ?& array['kind','ingredientId','patch'])
        or v_item-array['kind','ingredientId','patch']<>'{}'::jsonb
        or jsonb_typeof(v_item->'ingredientId') is distinct from 'string'
        or v_item->>'ingredientId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Invalid recipe ingredient identity' using errcode='22023';
      end if;
      perform private.nest_recipe_ingredient_patch(v_item->'patch');
    else raise exception 'Invalid recipe ingredient kind' using errcode='22023';
    end if;
  end loop;
  select count(*),count(distinct lower(item->>'ingredientId')) into v_count,v_unique
    from jsonb_array_elements(p_items) item where item->>'kind'='existing';
  if v_count<>v_unique then raise exception 'Invalid duplicate ingredient' using errcode='22023'; end if;
end;
$$;

create function private.nest_recipe_edit_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>2097152
    or not(p_input ?& array['definitionId','expectedRevision','patch','ingredients'])
    or p_input-array['definitionId','expectedRevision','patch','ingredients']<>'{}'::jsonb then
    raise exception 'Invalid recipe edit' using errcode='22023';
  end if;
  -- Archive's target validation reserves one increment; editing may be a no-op at max.
  if jsonb_typeof(p_input->'definitionId') is distinct from 'string'
    or p_input->>'definitionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_input->'expectedRevision') is distinct from 'string'
    or p_input->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'Invalid recipe edit target' using errcode='22023';
  end if;
  perform (p_input->>'expectedRevision')::bigint;
  perform private.nest_recipe_metadata_patch(p_input->'patch');
  perform private.nest_recipe_edit_selection(p_input->'ingredients');
  if p_input->'patch'='{}'::jsonb and p_input->'ingredients'='null'::jsonb then
    raise exception 'Invalid empty recipe edit' using errcode='22023';
  end if;
exception when numeric_value_out_of_range then
  raise exception 'Invalid recipe edit revision' using errcode='22023';
end;
$$;

create function private.nest_patch_recipe_metadata(p_household uuid,p_definition uuid,p_patch jsonb)
returns void language plpgsql set search_path='' as $$
declare v_old public.meal_definitions; v_new public.meal_definitions;
begin
  select * into strict v_old from public.meal_definitions where household_id=p_household and id=p_definition;
  v_new:=v_old;
  if p_patch ? 'title' then v_new.name:=p_patch->>'title'; end if;
  if p_patch ? 'servings' then v_new.nest_servings:=(p_patch->>'servings')::numeric::integer; end if;
  if p_patch ? 'instructions' then v_new.nest_instructions:=p_patch->>'instructions'; end if;
  if p_patch ? 'recipeUrl' then v_new.recipe_url:=p_patch->>'recipeUrl'; end if;
  if p_patch ? 'notes' then v_new.notes:=p_patch->>'notes'; end if;
  if v_new is not distinct from v_old then return; end if;
  update public.meal_definitions set name=v_new.name,nest_servings=v_new.nest_servings,
    nest_instructions=v_new.nest_instructions,recipe_url=v_new.recipe_url,notes=v_new.notes
    where household_id=p_household and id=p_definition;
end;
$$;

create function private.nest_patch_recipe_ingredient(p_household uuid,p_definition uuid,p_id uuid,p_patch jsonb,p_order integer)
returns void language plpgsql set search_path='' as $$
declare v_old public.meal_grocery_templates; v_new public.meal_grocery_templates;
begin
  select * into strict v_old from public.meal_grocery_templates
    where household_id=p_household and meal_definition_id=p_definition and id=p_id and archived_at is null;
  v_new:=v_old; v_new.sort_order:=p_order;
  if p_patch ? 'name' then v_new.name:=p_patch->>'name'; end if;
  if p_patch ? 'quantity' then v_new.quantity:=p_patch->>'quantity'; end if;
  if p_patch ? 'unit' then v_new.unit:=p_patch->>'unit'; end if;
  if p_patch ? 'categoryId' then v_new.grocery_category_id:=(p_patch->>'categoryId')::uuid; end if;
  if p_patch ? 'note' then v_new.note:=p_patch->>'note'; end if;
  if v_new is not distinct from v_old then return; end if;
  update public.meal_grocery_templates set name=v_new.name,quantity=v_new.quantity,unit=v_new.unit,
    grocery_category_id=v_new.grocery_category_id,note=v_new.note,sort_order=v_new.sort_order
    where household_id=p_household and meal_definition_id=p_definition and id=p_id;
end;
$$;

create function private.nest_lock_recipe_selection(p_household uuid,p_definition uuid,p_items jsonb)
returns void language plpgsql set search_path='' as $$
declare v_id uuid;
begin
  perform 1 from public.meal_grocery_templates where household_id=p_household
    and meal_definition_id=p_definition and archived_at is null order by id for update nowait;
  if (select count(*) from public.meal_grocery_templates where household_id=p_household
    and meal_definition_id=p_definition and archived_at is null)>200 then
    raise exception 'Recipe ingredients changed' using errcode='40001';
  end if;
  for v_id in select (item->>'ingredientId')::uuid from jsonb_array_elements(p_items) item
    where item->>'kind'='existing' loop
    if not exists(select 1 from public.meal_grocery_templates where household_id=p_household
      and meal_definition_id=p_definition and id=v_id and archived_at is null) then
      raise exception 'Recipe ingredients changed' using errcode='40001';
    end if;
  end loop;
  for v_id in select distinct (case when item->>'kind'='new' then item->>'categoryId'
    else item->'patch'->>'categoryId' end)::uuid from jsonb_array_elements(p_items) item order by 1 loop
    if v_id is null then continue; end if;
    perform 1 from public.grocery_categories where household_id=p_household and id=v_id
      and archived_at is null for share nowait;
    if not found then raise exception 'Ingredient category changed' using errcode='40001'; end if;
  end loop;
end;
$$;

create function private.nest_apply_recipe_selection(p_household uuid,p_definition uuid,p_items jsonb)
returns void language plpgsql set search_path='' as $$
declare v_item jsonb; v_order integer:=0;
begin
  if p_items='null'::jsonb then return; end if;
  perform private.nest_lock_recipe_selection(p_household,p_definition,p_items);
  update public.meal_grocery_templates set archived_at=clock_timestamp()
    where household_id=p_household and meal_definition_id=p_definition and archived_at is null
      and id not in (select (item->>'ingredientId')::uuid from jsonb_array_elements(p_items) item where item->>'kind'='existing');
  for v_item in select value from jsonb_array_elements(p_items) loop
    if v_item->>'kind'='existing' then
      perform private.nest_patch_recipe_ingredient(p_household,p_definition,
        (v_item->>'ingredientId')::uuid,v_item->'patch',v_order);
    else
      insert into public.meal_grocery_templates(household_id,meal_definition_id,name,quantity,unit,grocery_category_id,note,sort_order)
        values(p_household,p_definition,v_item->>'name',v_item->>'quantity',v_item->>'unit',
          (v_item->>'categoryId')::uuid,v_item->>'note',v_order);
    end if;
    v_order:=v_order+1;
  end loop;
end;
$$;

create function private.nest_edit_recipe(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_recipe_edit_receipts;
  v_revision bigint; v_definition uuid; v_result jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid recipe operation' using errcode='22023'; end if;
  perform private.nest_recipe_edit_input(p_input);
  v_definition:=(p_input->>'definitionId')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('nest:recipe-edit:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(p_input::text,'UTF8'));
  select * into v_prior from public.nest_recipe_edit_receipts
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
  perform private.nest_patch_recipe_metadata(p_household,v_definition,p_input->'patch');
  perform private.nest_apply_recipe_selection(p_household,v_definition,p_input->'ingredients');
  select revision into v_revision from public.nest_meal_library_revisions where household_id=p_household;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'definitionId',v_definition,'previousRevision',p_input->>'expectedRevision','revision',v_revision::text);
  insert into public.nest_recipe_edit_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when unique_violation or lock_not_available or deadlock_detected or numeric_value_out_of_range then
  raise exception 'Meal library changed' using errcode='40001';
end;
$$;

revoke all on function private.nest_recipe_metadata_patch(jsonb),private.nest_recipe_ingredient_patch(jsonb),
  private.nest_recipe_edit_selection(jsonb),private.nest_recipe_edit_input(jsonb),
  private.nest_patch_recipe_metadata(uuid,uuid,jsonb),private.nest_patch_recipe_ingredient(uuid,uuid,uuid,jsonb,integer),
  private.nest_lock_recipe_selection(uuid,uuid,jsonb),private.nest_apply_recipe_selection(uuid,uuid,jsonb),
  private.nest_edit_recipe(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_edit_recipe(uuid,uuid,jsonb) to authenticated;
create function public.nest_edit_recipe(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_edit_recipe($1,$2,$3);
$$;
revoke all on function public.nest_edit_recipe(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_edit_recipe(uuid,uuid,jsonb) to authenticated;
