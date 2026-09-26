-- Stale offline intent is a terminal business conflict, not a transaction retry.
create or replace function private.nest_apply_grocery_check(
  p_household uuid, p_target uuid, p_expected bigint, p_checked boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item public.grocery_items;
  v_outcome text := 'already_applied';
begin
  if auth.uid() is null or not exists(select 1 from public.household_members
    where user_id=auth.uid() and household_id=p_household) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v_item from public.grocery_items
    where household_id = p_household and id = p_target for update;
  if not found or v_item.state not in ('active','claimed') then
    raise exception 'Grocery item unavailable' using errcode = 'P0002';
  end if;
  if v_item.native_checked is distinct from p_checked then
    if v_item.native_version <> p_expected then
      raise exception 'Grocery item changed' using errcode = 'PT412';
    end if;
    update public.grocery_items set native_checked = p_checked
      where id = p_target and household_id = p_household returning * into v_item;
    v_outcome := 'applied';
  end if;
  return jsonb_build_object('target', v_item.id, 'version', v_item.native_version::text,
    'checked', v_item.native_checked, 'outcome', v_outcome);
end;
$$;
