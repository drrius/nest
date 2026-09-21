-- GATED additive candidate. Explicit ingredient selection only; never called by meal approval.
create table private.nest_meal_ingredient_additions (
  household_id uuid not null references public.households(id),
  entry_id uuid not null, ingredient_id uuid not null, item_id uuid not null unique references public.grocery_items(id),
  actor_id uuid not null, created_at timestamptz not null default clock_timestamp(),
  primary key(household_id,entry_id,ingredient_id),
  foreign key(household_id,entry_id) references public.meal_plan_entries(household_id,id)
);
create table private.nest_meal_ingredient_receipts (
  actor_id uuid not null, household_id uuid not null references public.households(id), operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(), primary key(actor_id,household_id,operation_id)
);
alter table private.nest_meal_ingredient_additions enable row level security;
alter table private.nest_meal_ingredient_receipts enable row level security;
revoke all on private.nest_meal_ingredient_additions,private.nest_meal_ingredient_receipts from public,anon,authenticated,service_role;

create function private.nest_reviewed_ingredient(p_row jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_row) is distinct from 'object'
    or not(p_row ?& array['entryId','ingredientId','quantity','unit'])
    or p_row-array['entryId','ingredientId','quantity','unit']<>'{}'::jsonb
    or jsonb_typeof(p_row->'entryId') is distinct from 'string'
    or jsonb_typeof(p_row->'ingredientId') is distinct from 'string'
    or p_row->>'entryId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_row->>'ingredientId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_row->'quantity') not in ('string','null')
    or jsonb_typeof(p_row->'unit') not in ('string','null')
    or length(p_row->>'quantity')>80 or length(p_row->>'unit')>80 then
    raise exception 'Invalid ingredient selection' using errcode='22023'; end if;
  return jsonb_set(jsonb_set(p_row,'{entryId}',to_jsonb(lower(p_row->>'entryId'))),
    '{ingredientId}',to_jsonb(lower(p_row->>'ingredientId')));
end;
$$;
revoke all on function private.nest_reviewed_ingredient(jsonb) from public,anon,authenticated,service_role;

create function private.nest_meal_ingredient_selection(p_input jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare v_rows jsonb; v_revision bigint; v_count integer;
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>8388608
    or not(p_input ?& array['weekStart','expectedRevision','selected'])
    or p_input-array['weekStart','expectedRevision','selected']<>'{}'::jsonb
    or jsonb_typeof(p_input->'weekStart') is distinct from 'string'
    or jsonb_typeof(p_input->'expectedRevision') is distinct from 'string'
    or p_input->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,18})$'
    or jsonb_typeof(p_input->'selected') is distinct from 'array' then
    raise exception 'Invalid ingredient selection' using errcode='22023'; end if;
  v_revision:=(p_input->>'expectedRevision')::bigint;
  perform private.nest_meal_placement_dates(p_input->>'weekStart',p_input->>'weekStart');
  if jsonb_array_length(p_input->'selected') not between 1 and 4200 then
    raise exception 'Invalid ingredient selection' using errcode='22023'; end if;
  select jsonb_agg(private.nest_reviewed_ingredient(value) order by position) into v_rows
    from jsonb_array_elements(p_input->'selected') with ordinality as rows(value,position);
  select count(distinct (value->>'entryId',value->>'ingredientId')) into v_count from jsonb_array_elements(v_rows);
  if v_count<>jsonb_array_length(v_rows) then raise exception 'Duplicate ingredient selection' using errcode='22023'; end if;
  return jsonb_set(p_input,'{selected}',v_rows);
exception when numeric_value_out_of_range then
  raise exception 'Invalid ingredient selection' using errcode='22023';
end;
$$;
revoke all on function private.nest_meal_ingredient_selection(jsonb) from public,anon,authenticated,service_role;

create function private.nest_add_reviewed_ingredient(p_household uuid,p_week date,p_row jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_entry public.meal_plan_entries; v_source jsonb; v_item uuid; v_category uuid; v_result jsonb;
begin
  select * into v_entry from public.meal_plan_entries
    where household_id=p_household and id=(p_row->>'entryId')::uuid for share nowait;
  if not found or v_entry.removed_at is not null or v_entry.slot is null
    or v_entry.leftover_of_entry_id is not null or v_entry.date<p_week or v_entry.date>p_week+6 then
    raise exception 'Meal source changed' using errcode='40001'; end if;
  select i.value into strict v_source from public.nest_planned_recipe_snapshots s
    cross join lateral jsonb_array_elements(s.recipe->'ingredients') i(value)
    where s.household_id=p_household and s.entry_id=v_entry.id
      and i.value->>'ingredientId'=p_row->>'ingredientId';
  select item_id into v_item from private.nest_meal_ingredient_additions
    where household_id=p_household and entry_id=v_entry.id and ingredient_id=(p_row->>'ingredientId')::uuid;
  v_result:=jsonb_build_object('entryId',v_entry.id,'ingredientId',p_row->>'ingredientId');
  if found then return v_result||jsonb_build_object('itemId',v_item,'outcome','already_added'); end if;
  v_category:=(v_source->>'categoryId')::uuid;
  if v_category is not null then
    select case when archived_at is null then id else null end into v_category
      from public.grocery_categories where household_id=p_household and id=v_category for share nowait;
    if not found then raise exception 'Ingredient category changed' using errcode='40001'; end if;
  end if;
  v_item:=gen_random_uuid();
  insert into public.grocery_items(id,household_id,name,quantity,unit,category_id,note,originating_meal_plan_entry_id,sort_order)
    values(v_item,p_household,btrim(v_source->>'name'),p_row->>'quantity',p_row->>'unit',v_category,
      v_source->>'note',v_entry.id,0);
  insert into private.nest_meal_ingredient_additions(household_id,entry_id,ingredient_id,item_id,actor_id)
    values(p_household,v_entry.id,(p_row->>'ingredientId')::uuid,v_item,auth.uid());
  return v_result||jsonb_build_object('itemId',v_item,'outcome','added');
exception when no_data_found or too_many_rows or lock_not_available then
  raise exception 'Ingredient source changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_add_reviewed_ingredient(uuid,date,jsonb) from public,anon,authenticated,service_role;

create function private.nest_add_meal_ingredients(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_input jsonb; v_hash bytea; v_prior private.nest_meal_ingredient_receipts;
  v_week date; v_revision bigint; v_results jsonb; v_result jsonb;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Meal week changed' using errcode='40001'; end if;
  perform 1 from public.household_members where user_id=v_actor and household_id=p_household for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid ingredient operation' using errcode='22023'; end if;
  v_input:=private.nest_meal_ingredient_selection(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:ingredients:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(v_input::text,'UTF8'));
  select * into v_prior from private.nest_meal_ingredient_receipts where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_prior.request_hash<>v_hash then raise exception 'Ingredient operation changed' using errcode='22023'; end if;
    return v_prior.result;
  end if;
  v_week:=(v_input->>'weekStart')::date;
  select revision into v_revision from public.nest_meal_week_revisions
    where household_id=p_household and week_start=v_week for update;
  if not found or v_revision<>(v_input->>'expectedRevision')::bigint then
    raise exception 'Meal week changed' using errcode='40001'; end if;
  select jsonb_agg(private.nest_add_reviewed_ingredient(p_household,v_week,value) order by position) into v_results
    from jsonb_array_elements(v_input->'selected') with ordinality as rows(value,position);
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'weekStart',v_input->>'weekStart','weekRevision',v_revision::text,'ingredients',v_results);
  insert into private.nest_meal_ingredient_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when unique_violation or foreign_key_violation or lock_not_available or deadlock_detected then
  raise exception 'Ingredient sources changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_add_meal_ingredients(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_add_meal_ingredients(uuid,uuid,jsonb) to authenticated;
create function public.nest_add_meal_ingredients(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.nest_add_meal_ingredients($1,$2,$3); $$;
revoke all on function public.nest_add_meal_ingredients(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_add_meal_ingredients(uuid,uuid,jsonb) to authenticated;
