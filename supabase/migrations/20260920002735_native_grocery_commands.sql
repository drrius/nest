-- GATED: online checklist commands. Apply only after approved legacy-writer cutover.
create table public.nest_grocery_edit_receipts (
  actor_id uuid not null, household_id uuid not null, operation_id uuid not null,
  request jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key(actor_id, household_id, operation_id)
);
alter table public.nest_grocery_edit_receipts enable row level security;
revoke all on public.nest_grocery_edit_receipts from public, anon, authenticated;
grant select on public.nest_grocery_edit_receipts to authenticated;
create policy own_grocery_edit_receipts on public.nest_grocery_edit_receipts
  for select to authenticated using(actor_id=(select auth.uid()) and exists(
    select 1 from public.household_members m where m.user_id=(select auth.uid())
      and m.household_id=nest_grocery_edit_receipts.household_id));

create function private.nest_validate_grocery_edit(
  p_action text, p_expected bigint, p_name text, p_quantity text, p_unit text, p_category uuid
) returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_action is null or p_action not in ('add','edit','remove') then
    raise exception 'Invalid grocery action' using errcode='22023';
  end if;
  if (p_action='add' and p_expected is not null)
    or (p_action<>'add' and (p_expected is null or p_expected<1)) then
    raise exception 'Invalid grocery version' using errcode='22023';
  end if;
  if p_action='remove' then
    if p_name is not null or p_quantity is not null or p_unit is not null or p_category is not null then
      raise exception 'Removal cannot edit grocery fields' using errcode='22023';
    end if;
  elsif p_name is null or length(trim(p_name)) not between 1 and 120
    or length(p_name)>120 or length(p_quantity)>80 or length(p_unit)>80 then
    raise exception 'Invalid grocery fields' using errcode='22023';
  end if;
end;
$$;
revoke all on function private.nest_validate_grocery_edit(text,bigint,text,text,text,uuid) from public,anon,authenticated;

create function private.nest_apply_grocery_edit(
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
    if not found then raise exception 'Grocery identity already exists' using errcode='40001'; end if;
  else
    select * into v_item from public.grocery_items where id=p_target and household_id=p_household for update;
    if not found or v_item.state not in ('active','claimed') then
      raise exception 'Grocery item unavailable' using errcode='P0002';
    end if;
    if v_item.native_version<>p_expected then
      raise exception 'Grocery item changed' using errcode='40001';
    end if;
    if p_action='remove' then
      -- Retain legacy claim/session history. Claimed rows require explicit reconciliation
      -- at cutover; native removal must not silently detach another active shopping session.
      if v_item.state='claimed' then
        raise exception 'Legacy grocery claim requires reconciliation' using errcode='40001';
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
revoke all on function private.nest_apply_grocery_edit(uuid,text,uuid,bigint,text,text,text,uuid) from public,anon,authenticated;

create function private.nest_edit_grocery(
  p_household uuid, p_operation uuid, p_action text, p_target uuid, p_expected bigint,
  p_name text, p_quantity text, p_unit text, p_category uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_request jsonb; v_result jsonb;
  v_receipt public.nest_grocery_edit_receipts;
begin
  perform 1 from public.household_members where user_id=v_actor and household_id=p_household for key share;
  if v_actor is null or not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_operation is null or p_target is null then
    raise exception 'Missing grocery identity' using errcode='22023';
  end if;
  perform private.nest_validate_grocery_edit(p_action,p_expected,p_name,p_quantity,p_unit,p_category);
  v_request:=jsonb_build_object('action',p_action,'target',p_target,'expected',p_expected::text,
    'name',p_name,'quantity',p_quantity,'unit',p_unit,'category',p_category);
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text||':'||p_household::text||':'||p_operation::text,0));
  select * into v_receipt from public.nest_grocery_edit_receipts
    where actor_id=v_actor and household_id=p_household and operation_id=p_operation;
  if found then
    if v_receipt.request is distinct from v_request then
      raise exception 'Operation payload changed' using errcode='22023';
    end if;
    return v_receipt.result;
  end if;
  v_result:=private.nest_apply_grocery_edit(p_household,p_action,p_target,p_expected,p_name,p_quantity,p_unit,p_category)
    || jsonb_build_object('operation',p_operation);
  insert into public.nest_grocery_edit_receipts(actor_id,household_id,operation_id,request,result)
    values(v_actor,p_household,p_operation,v_request,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_edit_grocery(uuid,uuid,text,uuid,bigint,text,text,text,uuid) from public,anon,authenticated;
grant execute on function private.nest_edit_grocery(uuid,uuid,text,uuid,bigint,text,text,text,uuid) to authenticated;
create function public.nest_edit_grocery(
  p_household uuid, p_operation uuid, p_action text, p_target uuid, p_expected bigint,
  p_name text, p_quantity text, p_unit text, p_category uuid
) returns jsonb language sql security invoker set search_path='' as $$
  select private.nest_edit_grocery($1,$2,$3,$4,$5,$6,$7,$8,$9);
$$;
revoke all on function public.nest_edit_grocery(uuid,uuid,text,uuid,bigint,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.nest_edit_grocery(uuid,uuid,text,uuid,bigint,text,text,text,uuid) to authenticated;
