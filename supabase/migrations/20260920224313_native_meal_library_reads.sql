-- GATED additive candidate; legacy unknown recipe metadata remains unknown.
alter table public.meal_definitions
  add column nest_servings integer check(nest_servings>0),
  add column nest_instructions text check(length(nest_instructions) between 1 and 4000 and btrim(nest_instructions)<>'');
create table public.nest_meal_library_revisions (
  household_id uuid primary key references public.households(id) on delete cascade,
  revision bigint not null check(revision>=0)
);
alter table public.nest_meal_library_revisions enable row level security;
revoke all on public.nest_meal_library_revisions from public,anon,authenticated,service_role;
grant select on public.nest_meal_library_revisions to authenticated;
create policy members_read_meal_library_revisions on public.nest_meal_library_revisions
  for select to authenticated using((select private.is_household_member(household_id)));

-- Trigger-only definer; existing RLS/commands authorize source writes. Include
-- legacy ingredient edits and both homes of an administrative reassignment.
create function private.nest_advance_meal_library()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_old uuid; v_new uuid; v_home uuid;
begin
  if tg_op<>'INSERT' then v_old:=old.household_id; end if;
  if tg_op<>'DELETE' then v_new:=new.household_id; end if;
  for v_home in select distinct h from (values(v_old),(v_new)) homes(h)
    where h is not null order by h
  loop
    insert into public.nest_meal_library_revisions(household_id,revision)
      select v_home,1 where exists(select 1 from public.households where id=v_home)
    on conflict(household_id) do update set revision=public.nest_meal_library_revisions.revision+1;
  end loop;
  return null;
end;
$$;
revoke all on function private.nest_advance_meal_library() from public,anon,authenticated,service_role;
create trigger nest_definitions_advance_library after insert or update or delete
  on public.meal_definitions for each row execute function private.nest_advance_meal_library();
create trigger nest_ingredients_advance_library after insert or update or delete
  on public.meal_grocery_templates for each row execute function private.nest_advance_meal_library();

create function private.nest_meal_library_revision(p_household uuid,p_expected text)
returns bigint language plpgsql stable security invoker set search_path='' as $$
declare v_revision bigint;
begin
  if auth.uid() is null or not private.is_household_member(p_household) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_expected is not null and p_expected !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'Invalid library revision' using errcode='22023';
  end if;
  select revision into v_revision from public.nest_meal_library_revisions where household_id=p_household;
  v_revision:=coalesce(v_revision,0);
  if p_expected is not null and p_expected::bigint<>v_revision then
    raise exception 'Meal library changed' using errcode='40001';
  end if;
  return v_revision;
exception when numeric_value_out_of_range then
  raise exception 'Invalid library revision' using errcode='22023';
end;
$$;
revoke all on function private.nest_meal_library_revision(uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.nest_meal_library_revision(uuid,text) to authenticated;

-- STABLE invoker reads share the caller's single MVCC snapshot, including revision,
-- definitions and ingredients; no ingredient edit can create a mixed snapshot.
create function private.nest_meal_library_page(p_household uuid,p_after uuid,p_expected text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_revision bigint; v_rows jsonb; v_more boolean;
begin
  v_revision:=private.nest_meal_library_revision(p_household,p_expected);
  if p_after is not null and p_expected is null then
    raise exception 'A library cursor needs its revision' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('definitionId',id,'title',name,'servings',nest_servings)
    order by id),'[]'::jsonb) into v_rows
  from (select id,name,nest_servings from public.meal_definitions
    where household_id=p_household and archived_at is null and (p_after is null or id>p_after)
    order by id limit 51) rows;
  v_more:=jsonb_array_length(v_rows)>50;
  if v_more then v_rows:=v_rows-50; end if;
  return jsonb_build_object('version',1,'householdId',p_household,'revision',v_revision::text,
    'meals',v_rows,'nextAfterId',case when v_more then v_rows->49->>'definitionId' end);
end;
$$;
revoke all on function private.nest_meal_library_page(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.nest_meal_library_page(uuid,uuid,text) to authenticated;
create function public.nest_meal_library_page(p_household uuid,p_after uuid,p_expected text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_meal_library_page($1,$2,$3);
$$;
revoke all on function public.nest_meal_library_page(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.nest_meal_library_page(uuid,uuid,text) to authenticated;

create function private.nest_saved_meal(p_household uuid,p_definition uuid,p_expected text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_revision bigint; v_meal public.meal_definitions; v_ingredients jsonb; v_recipe jsonb;
begin
  v_revision:=private.nest_meal_library_revision(p_household,p_expected);
  if p_definition is null or p_expected is null then
    raise exception 'Invalid saved meal request' using errcode='22023';
  end if;
  select * into v_meal from public.meal_definitions
    where household_id=p_household and id=p_definition and archived_at is null;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object('ingredientId',id,'name',name,'quantity',quantity,
      'unit',unit,'categoryId',grocery_category_id,'note',note,'order',sort_order)
      order by sort_order,id),'[]'::jsonb) into v_ingredients
    from (select * from public.meal_grocery_templates where household_id=p_household
      and meal_definition_id=p_definition and archived_at is null order by sort_order,id limit 201) rows;
    if jsonb_array_length(v_ingredients)>200 then
      raise exception 'Recipe exceeds supported ingredient count' using errcode='22023';
    end if;
    v_recipe:=jsonb_build_object('definitionId',v_meal.id,'title',v_meal.name,'recipeUrl',v_meal.recipe_url,
      'notes',v_meal.notes,'servings',v_meal.nest_servings,'instructions',v_meal.nest_instructions,
      'ingredients',v_ingredients);
  end if;
  return jsonb_build_object('version',1,'householdId',p_household,'revision',v_revision::text,'recipe',v_recipe);
end;
$$;
revoke all on function private.nest_saved_meal(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function private.nest_saved_meal(uuid,uuid,text) to authenticated;
create function public.nest_saved_meal(p_household uuid,p_definition uuid,p_expected text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_saved_meal($1,$2,$3);
$$;
revoke all on function public.nest_saved_meal(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.nest_saved_meal(uuid,uuid,text) to authenticated;
