-- GATED additive candidate. Share the existing saved-recipe projection without changing its read contract.
-- This invoker helper relies on existing recipe/template RLS for authenticated callers.
create function private.nest_saved_recipe_payload(p_household uuid,p_definition uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_meal public.meal_definitions; v_ingredients jsonb;
begin
  select * into v_meal from public.meal_definitions where household_id=p_household and id=p_definition and archived_at is null;
  if not found then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('ingredientId',id,'name',name,'quantity',quantity,
    'unit',unit,'categoryId',grocery_category_id,'note',note,'order',sort_order) order by sort_order,id),'[]'::jsonb)
    into v_ingredients from (select * from public.meal_grocery_templates where household_id=p_household
      and meal_definition_id=p_definition and archived_at is null order by sort_order,id limit 201) rows;
  if jsonb_array_length(v_ingredients)>200 then raise exception 'Recipe exceeds supported ingredient count' using errcode='22023'; end if;
  return jsonb_build_object('definitionId',v_meal.id,'title',v_meal.name,'recipeUrl',v_meal.recipe_url,
    'notes',v_meal.notes,'servings',v_meal.nest_servings,'instructions',v_meal.nest_instructions,'ingredients',v_ingredients);
end;
$$;
revoke all on function private.nest_saved_recipe_payload(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function private.nest_saved_recipe_payload(uuid,uuid) to authenticated;
create or replace function private.nest_saved_meal(p_household uuid,p_definition uuid,p_expected text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_revision bigint;
begin
  v_revision:=private.nest_meal_library_revision(p_household,p_expected);
  if p_definition is null or p_expected is null then raise exception 'Invalid saved meal request' using errcode='22023'; end if;
  return jsonb_build_object('version',1,'householdId',p_household,'revision',v_revision::text,
    'recipe',private.nest_saved_recipe_payload(p_household,p_definition));
end;
$$;

create function private.nest_proposal_saved_source(p_household uuid,p_source jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare v_definition uuid; v_revision bigint; v_recipe jsonb;
begin
  if not(p_source ?& array['kind','libraryRevision','recipe']) or p_source-array['kind','libraryRevision','recipe']<>'{}'::jsonb
    or jsonb_typeof(p_source->'libraryRevision') is distinct from 'string'
    or p_source->>'libraryRevision' !~ '^(0|[1-9][0-9]{0,18})$'
    or jsonb_typeof(p_source#>'{recipe,definitionId}') is distinct from 'string'
    or p_source#>>'{recipe,definitionId}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid saved proposal recipe' using errcode='22023'; end if;
  v_revision:=(p_source->>'libraryRevision')::bigint; v_definition:=(p_source#>>'{recipe,definitionId}')::uuid;
  insert into public.nest_meal_library_revisions(household_id,revision) values(p_household,0) on conflict(household_id) do nothing;
  perform 1 from public.nest_meal_library_revisions where household_id=p_household and revision=v_revision for update;
  if not found then raise exception 'Meal library changed' using errcode='40001'; end if;
  perform 1 from public.meal_definitions where household_id=p_household and id=v_definition and archived_at is null for share nowait;
  if not found then raise exception 'Saved recipe changed' using errcode='40001'; end if;
  perform 1 from public.meal_grocery_templates where household_id=p_household and meal_definition_id=v_definition
    and archived_at is null order by id for share nowait;
  v_recipe:=private.nest_saved_recipe_payload(p_household,v_definition);
  if v_recipe is distinct from p_source->'recipe' or v_recipe->'servings'='null'::jsonb
    or v_recipe->'instructions'='null'::jsonb or btrim(v_recipe->>'instructions')=''
    or jsonb_array_length(v_recipe->'ingredients')=0 then
    raise exception 'Invalid saved proposal recipe' using errcode='22023'; end if;
exception when numeric_value_out_of_range then raise exception 'Invalid saved proposal recipe' using errcode='22023';
end;
$$;

create function private.nest_proposal_entry(p_proposal private.nest_meal_proposals,p_entry jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare v_source jsonb:=p_entry->'source'; v_calories numeric;
  v_keys text[]:=array['entryId','date','slot','source','estimatedCaloriesPerServing'];
begin
  if jsonb_typeof(p_entry) is distinct from 'object' or not(p_entry ?& v_keys) or p_entry-v_keys<>'{}'::jsonb
    or jsonb_typeof(p_entry->'entryId') is distinct from 'string'
    or p_entry->>'entryId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_entry->'date') is distinct from 'string' or jsonb_typeof(p_entry->'slot') is distinct from 'string'
    or p_entry->>'slot' not in ('breakfast','lunch','dinner') or jsonb_typeof(v_source) is distinct from 'object' then
    raise exception 'Invalid proposal entry' using errcode='22023'; end if;
  perform private.nest_meal_placement_dates(to_char(p_proposal.week_start,'YYYY-MM-DD'),p_entry->>'date');
  if p_entry->'estimatedCaloriesPerServing'<>'null'::jsonb then
    if jsonb_typeof(p_entry->'estimatedCaloriesPerServing') is distinct from 'number' then
      raise exception 'Invalid calorie estimate' using errcode='22023'; end if;
    v_calories:=(p_entry->>'estimatedCaloriesPerServing')::numeric;
    if v_calories<1 or v_calories>20000 or trunc(v_calories)<>v_calories then
      raise exception 'Invalid calorie estimate' using errcode='22023'; end if;
  end if;
  if v_source->>'kind'='saved' then perform private.nest_proposal_saved_source(p_proposal.household_id,v_source);
  elsif v_source->>'kind'='suggested' and not p_proposal.familiar_only then
    if not(v_source ?& array['kind','recipe']) or v_source-array['kind','recipe']<>'{}'::jsonb then
      raise exception 'Invalid suggested recipe' using errcode='22023'; end if;
    perform private.nest_recipe_creation_input(jsonb_build_object('expectedRevision','0','recipe',v_source->'recipe'));
    if v_source#>'{recipe,recipeUrl}'<>'null'::jsonb or exists(select 1 from jsonb_array_elements(v_source#>'{recipe,ingredients}') i
      where i->'categoryId'<>'null'::jsonb) then raise exception 'Invalid generated source' using errcode='22023'; end if;
  else raise exception 'Invalid recipe source' using errcode='22023'; end if;
end;
$$;

create function private.nest_proposal_content(p_proposal private.nest_meal_proposals,p_content jsonb,p_context jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare v_entry jsonb; v_revision bigint; v_expected integer; v_keys text[]:=array['weekStart','familiarOnly','entries'];
begin
  if jsonb_typeof(p_content) is distinct from 'object' or octet_length(p_content::text)>4194304
    or not(p_content ?& v_keys) or p_content-v_keys<>'{}'::jsonb
    or p_content->'weekStart' is distinct from to_jsonb(to_char(p_proposal.week_start,'YYYY-MM-DD'))
    or p_content->'familiarOnly' is distinct from to_jsonb(p_proposal.familiar_only)
    or jsonb_typeof(p_content->'entries') is distinct from 'array' then
    raise exception 'Invalid proposal content' using errcode='22023'; end if;
  if jsonb_array_length(p_content->'entries') not between 1 and 21 then
    raise exception 'Invalid proposal entries' using errcode='22023'; end if;
  for v_entry in select value from jsonb_array_elements(p_content->'entries') loop
    perform private.nest_proposal_entry(p_proposal,v_entry);
  end loop;
  if (select count(distinct lower(e->>'entryId')) from jsonb_array_elements(p_content->'entries') e)<>jsonb_array_length(p_content->'entries')
    or (select count(distinct (e->>'date',e->>'slot')) from jsonb_array_elements(p_content->'entries') e)<>jsonb_array_length(p_content->'entries') then
    raise exception 'Duplicate proposal entries' using errcode='22023'; end if;
  select revision into v_revision from public.nest_meal_week_revisions where household_id=p_proposal.household_id and week_start=p_proposal.week_start for update;
  if v_revision is distinct from p_proposal.week_revision then raise exception 'Meal week changed' using errcode='40001'; end if;
  select count(*) into v_expected from generate_series(0,6) d cross join jsonb_array_elements_text(p_context#>'{cooking,preferences,mealSlots}') choices(slot)
    where not exists(select 1 from public.meal_plan_entries where household_id=p_proposal.household_id and date=p_proposal.week_start+d
      and meal_plan_entries.slot=choices.slot and removed_at is null);
  if v_expected<>jsonb_array_length(p_content->'entries') or exists(select 1 from jsonb_array_elements(p_content->'entries') e
    where not(p_context#>'{cooking,preferences,mealSlots}' ? (e->>'slot')) or exists(select 1 from public.meal_plan_entries
      where household_id=p_proposal.household_id and date=(e->>'date')::date and slot=e->>'slot' and removed_at is null)) then
    raise exception 'Proposal slots changed' using errcode='40001'; end if;
end;
$$;
revoke all on function private.nest_proposal_saved_source(uuid,jsonb),private.nest_proposal_entry(private.nest_meal_proposals,jsonb),
  private.nest_proposal_content(private.nest_meal_proposals,jsonb,jsonb) from public,anon,authenticated,service_role;
