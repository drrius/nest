-- GATED additive candidate. Read retained saved-week ingredients in bounded, revision-bound pages.
create function private.nest_ingredient_cursor(p_after jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
  if p_after is null or p_after='null'::jsonb then return null; end if;
  if jsonb_typeof(p_after) is distinct from 'object' or not(p_after ?& array['entryId','ingredientId'])
    or p_after-array['entryId','ingredientId']<>'{}'::jsonb
    or jsonb_typeof(p_after->'entryId') is distinct from 'string'
    or jsonb_typeof(p_after->'ingredientId') is distinct from 'string'
    or p_after->>'entryId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_after->>'ingredientId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid ingredient cursor' using errcode='22023'; end if;
  return jsonb_build_object('entryId',lower(p_after->>'entryId'),'ingredientId',lower(p_after->>'ingredientId'));
end;
$$;
revoke all on function private.nest_ingredient_cursor(jsonb) from public,anon,authenticated,service_role;

create function private.nest_meal_ingredient_page(p_household uuid,p_week date,p_after jsonb)
returns jsonb language sql stable security definer set search_path='' as $$
  with sources as (
    select e.id as entry_id,e.title_snapshot,e.date,e.slot,i.value as ingredient,
      c.id as category_id,a.item_id,
      row_number() over(order by e.id,(i.value->>'ingredientId')::uuid) as position
    from public.meal_plan_entries e join public.nest_planned_recipe_snapshots s
      on s.household_id=e.household_id and s.entry_id=e.id
    cross join lateral jsonb_array_elements(s.recipe->'ingredients') i(value)
    left join public.grocery_categories c on c.household_id=e.household_id
      and c.id=(i.value->>'categoryId')::uuid and c.archived_at is null
    left join private.nest_meal_ingredient_additions a on a.household_id=e.household_id
      and a.entry_id=e.id and a.ingredient_id=(i.value->>'ingredientId')::uuid
    where e.household_id=p_household and e.date between p_week and p_week+6
      and e.removed_at is null and e.slot is not null and e.leftover_of_entry_id is null
      and (p_after is null or (e.id,(i.value->>'ingredientId')::uuid)>
        ((p_after->>'entryId')::uuid,(p_after->>'ingredientId')::uuid))
    order by e.id,(i.value->>'ingredientId')::uuid limit 101
  ) select jsonb_build_object('ingredients',coalesce(jsonb_agg(jsonb_build_object(
    'entryId',entry_id,'ingredientId',ingredient->>'ingredientId','mealTitle',btrim(title_snapshot),
    'date',to_char(date,'YYYY-MM-DD'),'slot',slot,'name',btrim(ingredient->>'name'),
    'quantity',ingredient->'quantity','unit',ingredient->'unit','categoryId',category_id,'groceryItemId',item_id)
    order by position) filter(where position<=100),'[]'::jsonb),
    'nextAfter',case when count(*)>100 then (jsonb_agg(jsonb_build_object(
      'entryId',entry_id,'ingredientId',ingredient->>'ingredientId') order by position)->99) else null end)
  from sources;
$$;
revoke all on function private.nest_meal_ingredient_page(uuid,date,jsonb) from public,anon,authenticated,service_role;

create function private.nest_read_meal_ingredients(p_household uuid,p_week text,p_revision text,p_after jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_week jsonb; v_after jsonb; v_skipped jsonb; v_revision bigint;
begin
  v_week:=private.nest_meal_week_snapshot(p_household,p_week);
  if p_revision is null or p_revision !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'Invalid meal revision' using errcode='22023'; end if;
  v_revision:=p_revision::bigint;
  if v_week->>'revision'<>p_revision then raise exception 'Meal week changed' using errcode='40001'; end if;
  v_after:=private.nest_ingredient_cursor(p_after);
  select coalesce(jsonb_agg(jsonb_build_object('entryId',e.id,'reason',
    case when e.leftover_of_entry_id is not null then 'leftovers'
      when s.entry_id is null then 'no_recipe' else 'no_ingredients' end) order by e.id),'[]'::jsonb)
    into v_skipped from public.meal_plan_entries e left join public.nest_planned_recipe_snapshots s
      on s.household_id=e.household_id and s.entry_id=e.id
    where e.household_id=p_household and e.date between p_week::date and p_week::date+6
      and e.slot is not null and e.removed_at is null
      and (e.leftover_of_entry_id is not null or s.entry_id is null or jsonb_array_length(s.recipe->'ingredients')=0);
  return jsonb_build_object('version',1,'householdId',p_household,'weekStart',p_week,
    'revision',p_revision,'skipped',v_skipped)||private.nest_meal_ingredient_page(p_household,p_week::date,v_after);
exception when numeric_value_out_of_range then
  raise exception 'Invalid meal revision' using errcode='22023';
end;
$$;
revoke all on function private.nest_read_meal_ingredients(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_read_meal_ingredients(uuid,text,text,jsonb) to authenticated;
create function public.nest_read_meal_ingredients(p_household uuid,p_week text,p_revision text,p_after jsonb)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.nest_read_meal_ingredients($1,$2,$3,$4); $$;
revoke all on function public.nest_read_meal_ingredients(uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_read_meal_ingredients(uuid,text,text,jsonb) to authenticated;
