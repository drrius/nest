-- Business version/identity conflicts must not trigger hosted serialization retries.
-- CREATE OR REPLACE preserves the existing private function ACL and identity.
create or replace function private.nest_apply_grocery_edit(
  p_household uuid, p_action text, p_target uuid, p_expected bigint,
  p_name text, p_quantity text, p_unit text, p_category uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item public.grocery_items;
begin
  if auth.uid() is null or not exists(select 1 from public.household_members
    where household_id=p_household and user_id=auth.uid()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if p_category is not null then
    perform 1 from public.grocery_categories where id=p_category and household_id=p_household
      and archived_at is null for share;
    if not found then raise exception 'Category unavailable' using errcode='22023'; end if;
  end if;
  if p_action='add' then
    insert into public.grocery_items(id,household_id,name,quantity,unit,category_id,sort_order)
      values(p_target,p_household,trim(p_name),p_quantity,p_unit,p_category,0)
      on conflict(id) do nothing returning * into v_item;
    if not found then raise exception 'Grocery identity already exists' using errcode='PT412'; end if;
  else
    select * into v_item from public.grocery_items where id=p_target and household_id=p_household for update;
    if not found or v_item.state not in ('active','claimed') then
      raise exception 'Grocery item unavailable' using errcode='P0002';
    end if;
    if v_item.native_version<>p_expected then
      raise exception 'Grocery item changed' using errcode='PT412';
    end if;
    if p_action='remove' then
      -- Retain legacy claim/session history. Claimed rows require explicit reconciliation
      -- at cutover; native removal must not silently detach another active shopping session.
      if v_item.state='claimed' then
        raise exception 'Legacy grocery claim requires reconciliation' using errcode='PT412';
      end if;
      update public.grocery_items set state='removed',removed_at=now(),updated_at=now()
        where id=p_target and household_id=p_household returning * into v_item;
    else
      update public.grocery_items set name=trim(p_name),quantity=p_quantity,unit=p_unit,
        category_id=p_category,updated_at=now()
        where id=p_target and household_id=p_household returning * into v_item;
    end if;
  end if;
  return jsonb_build_object('target',v_item.id,'version',v_item.native_version::text,
    'checked',v_item.native_checked,'removed',v_item.state='removed');
end;
$$;
