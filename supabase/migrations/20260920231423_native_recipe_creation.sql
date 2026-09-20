-- GATED candidate. Explicit recipe creation only; never materializes a plan or groceries.
create table public.nest_recipe_creation_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request_hash bytea not null check(octet_length(request_hash)=32), result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_recipe_creation_receipts enable row level security;
revoke all on public.nest_recipe_creation_receipts from public,anon,authenticated,service_role;
grant select on public.nest_recipe_creation_receipts to authenticated;
create policy own_recipe_creation_receipts on public.nest_recipe_creation_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));

create function private.nest_recipe_text(p_value jsonb,p_max integer,p_nullable boolean)
returns void language plpgsql immutable set search_path='' as $$
declare v_text text:=p_value#>>'{}';
begin
  if p_nullable and p_value='null'::jsonb then return; end if;
  if jsonb_typeof(p_value) is distinct from 'string' or length(v_text)+
    (select count(*) from regexp_split_to_table(v_text,'') c where ascii(c)>65535)>p_max
    or btrim(v_text,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' then
    raise exception 'Invalid recipe text' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.nest_recipe_text(jsonb,integer,boolean) from public,anon,authenticated,service_role;

create function private.nest_recipe_source(p_value jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_link text:=p_value#>>'{}';
  v_space text:=U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  perform private.nest_recipe_text(p_value,2000,true);
  if p_value='null'::jsonb then return; end if;
  if v_link !~* '^https?://[^/?#@\\]+([/?#].*)?$' or position(E'\\' in v_link)>0
    or v_link ~ '[[:cntrl:]]' or translate(v_link,v_space,'')<>v_link then
    raise exception 'Invalid recipe source' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.nest_recipe_source(jsonb) from public,anon,authenticated,service_role;

create function private.nest_recipe_ingredient_input(p_item jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_keys text[]:=array['name','quantity','unit','categoryId','note'];
begin
  if jsonb_typeof(p_item) is distinct from 'object' or not(p_item ?& v_keys) or p_item-v_keys<>'{}'::jsonb then
    raise exception 'Invalid recipe ingredient' using errcode='22023';
  end if;
  perform private.nest_recipe_text(p_item->'name',120,false);
  perform private.nest_recipe_text(p_item->'quantity',80,true);
  perform private.nest_recipe_text(p_item->'unit',80,true);
  perform private.nest_recipe_text(p_item->'note',1000,true);
  if p_item->'categoryId'<>'null'::jsonb and (jsonb_typeof(p_item->'categoryId') is distinct from 'string'
    or p_item->>'categoryId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Invalid ingredient category' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.nest_recipe_ingredient_input(jsonb) from public,anon,authenticated,service_role;

create function private.nest_recipe_creation_input(p_input jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare v_recipe jsonb:=p_input->'recipe'; v_item jsonb; v_servings numeric; v_revision bigint;
  v_keys text[]:=array['title','servings','instructions','recipeUrl','notes','ingredients'];
begin
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>2097152
    or not(p_input ?& array['expectedRevision','recipe']) or p_input-array['expectedRevision','recipe']<>'{}'::jsonb
    or jsonb_typeof(p_input->'expectedRevision') is distinct from 'string'
    or p_input->>'expectedRevision' !~ '^(0|[1-9][0-9]{0,18})$' then
    raise exception 'Invalid recipe creation' using errcode='22023';
  end if;
  v_revision:=(p_input->>'expectedRevision')::bigint;
  if jsonb_typeof(v_recipe) is distinct from 'object' or not(v_recipe ?& v_keys) or v_recipe-v_keys<>'{}'::jsonb
    or jsonb_typeof(v_recipe->'servings') is distinct from 'number'
    or jsonb_typeof(v_recipe->'ingredients') is distinct from 'array' then
    raise exception 'Invalid recipe creation' using errcode='22023';
  end if;
  v_servings:=(v_recipe->>'servings')::numeric;
  if v_servings<1 or v_servings>2147483647 or trunc(v_servings)<>v_servings
    or jsonb_array_length(v_recipe->'ingredients') not between 1 and 200
    or v_revision>9223372036854775807-jsonb_array_length(v_recipe->'ingredients')-1 then
    raise exception 'Invalid recipe creation' using errcode='22023';
  end if;
  perform private.nest_recipe_text(v_recipe->'title',120,false);
  perform private.nest_recipe_text(v_recipe->'instructions',4000,false);
  perform private.nest_recipe_text(v_recipe->'notes',4000,true);
  perform private.nest_recipe_source(v_recipe->'recipeUrl');
  for v_item in select value from jsonb_array_elements(v_recipe->'ingredients') loop
    perform private.nest_recipe_ingredient_input(v_item);
  end loop;
exception when numeric_value_out_of_range then
  raise exception 'Invalid recipe creation' using errcode='22023';
end;
$$;
revoke all on function private.nest_recipe_creation_input(jsonb) from public,anon,authenticated,service_role;

-- Called only after membership, input, operation and exact library revision checks.
create function private.nest_insert_recipe(p_household uuid,p_recipe jsonb)
returns uuid language plpgsql set search_path='' as $$
declare v_definition uuid; v_category uuid;
begin
  for v_category in select distinct (item->>'categoryId')::uuid
    from jsonb_array_elements(p_recipe->'ingredients') item where item->>'categoryId' is not null
    order by 1
  loop
    perform 1 from public.grocery_categories where household_id=p_household and id=v_category
      and archived_at is null for share nowait;
    if not found then raise exception 'Ingredient category changed' using errcode='40001'; end if;
  end loop;
  insert into public.meal_definitions(household_id,name,nest_servings,nest_instructions,recipe_url,notes)
    values(p_household,p_recipe->>'title',(p_recipe->>'servings')::numeric::integer,
      p_recipe->>'instructions',p_recipe->>'recipeUrl',p_recipe->>'notes') returning id into v_definition;
  insert into public.meal_grocery_templates(household_id,meal_definition_id,name,quantity,unit,grocery_category_id,note,sort_order)
    select p_household,v_definition,item->>'name',item->>'quantity',item->>'unit',
      (item->>'categoryId')::uuid,item->>'note',ordinal-1
    from jsonb_array_elements(p_recipe->'ingredients') with ordinality as items(item,ordinal);
  return v_definition;
end;
$$;
revoke all on function private.nest_insert_recipe(uuid,jsonb) from public,anon,authenticated,service_role;

create function private.nest_create_recipe(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_hash bytea; v_prior public.nest_recipe_creation_receipts;
  v_revision bigint; v_definition uuid; v_result jsonb;
begin
  if v_actor is null then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.household_members where household_id=p_household and user_id=v_actor for key share;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null then raise exception 'Invalid recipe operation' using errcode='22023'; end if;
  perform private.nest_recipe_creation_input(p_input);
  perform pg_advisory_xact_lock(hashtextextended('nest:recipe-create:'||v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  v_hash:=sha256(convert_to(p_input::text,'UTF8'));
  select * into v_prior from public.nest_recipe_creation_receipts
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
  v_definition:=private.nest_insert_recipe(p_household,p_input->'recipe');
  select revision into v_revision from public.nest_meal_library_revisions where household_id=p_household;
  v_result:=jsonb_build_object('version',1,'actorId',v_actor,'householdId',p_household,
    'operationId',p_operation,'definitionId',v_definition,'revision',v_revision::text);
  insert into public.nest_recipe_creation_receipts(actor_id,household_id,operation_id,request_hash,result)
    values(v_actor,p_household,p_operation,v_hash,v_result);
  return v_result;
exception when unique_violation or lock_not_available or deadlock_detected then
  raise exception 'Meal library changed' using errcode='40001';
end;
$$;
revoke all on function private.nest_create_recipe(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.nest_create_recipe(uuid,uuid,jsonb) to authenticated;
create function public.nest_create_recipe(p_household uuid,p_operation uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_create_recipe($1,$2,$3);
$$;
revoke all on function public.nest_create_recipe(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nest_create_recipe(uuid,uuid,jsonb) to authenticated;
