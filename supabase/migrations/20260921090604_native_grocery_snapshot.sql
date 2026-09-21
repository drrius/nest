-- One atomic household snapshot. The JSON aggregate is not truncated by PostgREST's row cap.
create or replace function private.nest_grocery_snapshot(p_household uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_items jsonb;
begin
  if v_actor is null or not exists(select 1 from public.household_members where household_id=p_household and user_id=v_actor) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'itemId',g.id,'householdId',g.household_id,'name',g.name,'quantity',g.quantity,'unit',g.unit,
    'categoryId',g.category_id,'version',g.native_version::text,'checked',g.native_checked,'legacyState',g.state,
    'category',case when c.id is null then null else jsonb_build_object(
      'categoryId',c.id,'householdId',c.household_id,'name',c.name,'archivedAt',c.archived_at) end,
    'mealSource',case when e.id is null then null else jsonb_build_object(
      'entryId',e.id,'householdId',e.household_id,'title',e.title_snapshot,'date',e.date::text,'slot',e.slot) end
    ) order by g.sort_order,g.created_at,g.id),'[]'::jsonb) into v_items
  from public.grocery_items g
  left join public.grocery_categories c on c.household_id=g.household_id and c.id=g.category_id
  left join public.meal_plan_entries e on e.household_id=g.household_id and e.id=g.originating_meal_plan_entry_id
  where g.household_id=p_household and g.state in ('active','claimed');
  return jsonb_build_object('version',1,'householdId',p_household,'total',jsonb_array_length(v_items),'items',v_items);
end;
$$;
revoke all on function private.nest_grocery_snapshot(uuid) from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.nest_grocery_snapshot(uuid) to authenticated;
create or replace function public.nest_grocery_snapshot(p_household uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.nest_grocery_snapshot(p_household);
$$;
revoke all on function public.nest_grocery_snapshot(uuid) from public,anon,service_role;
grant execute on function public.nest_grocery_snapshot(uuid) to authenticated;
