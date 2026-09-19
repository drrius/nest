-- GATED: native checklist state is additive. Legacy purchase/session history is untouched.
alter table public.grocery_items
  add column native_checked boolean not null default false,
  add column native_version bigint not null default 1 check (native_version > 0);

create function private.nest_grocery_version() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  new.native_version := old.native_version + 1;
  return new;
end;
$$;
revoke all on function private.nest_grocery_version() from public, anon, authenticated;
create trigger nest_grocery_version before update on public.grocery_items
  for each row execute function private.nest_grocery_version();

create table public.nest_grocery_check_receipts (
  actor_id uuid not null,
  household_id uuid not null,
  operation_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id, household_id, operation_id)
);
alter table public.nest_grocery_check_receipts enable row level security;
revoke all on public.nest_grocery_check_receipts from public, anon, authenticated;
grant select on public.nest_grocery_check_receipts to authenticated;
create policy own_grocery_check_receipts on public.nest_grocery_check_receipts
  for select to authenticated using (actor_id = (select auth.uid()) and exists (
    select 1 from public.household_members m where m.user_id = (select auth.uid())
      and m.household_id = nest_grocery_check_receipts.household_id));

create function private.nest_apply_grocery_check(
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
      raise exception 'Grocery item changed' using errcode = '40001';
    end if;
    update public.grocery_items set native_checked = p_checked
      where id = p_target and household_id = p_household returning * into v_item;
    v_outcome := 'applied';
  end if;
  return jsonb_build_object('target', v_item.id, 'version', v_item.native_version::text,
    'checked', v_item.native_checked, 'outcome', v_outcome);
end;
$$;
-- Only the authenticated receipt wrapper may call this internal mutation helper.
revoke all on function private.nest_apply_grocery_check(uuid,uuid,bigint,boolean) from public, anon, authenticated;

create function private.nest_set_grocery_checked(
  p_household uuid, p_operation uuid, p_target uuid, p_expected bigint, p_checked boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_request jsonb;
  v_receipt public.nest_grocery_check_receipts;
  v_result jsonb;
begin
  perform 1 from public.household_members
    where user_id = v_actor and household_id = p_household for key share;
  if v_actor is null or not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_operation is null or p_target is null or p_expected is null or p_expected < 1 or p_checked is null then
    raise exception 'Invalid check request' using errcode = '22023';
  end if;
  v_request := jsonb_build_object('target',p_target,'expected',p_expected::text,'checked',p_checked);
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || p_household::text || ':' || p_operation::text, 0));
  select * into v_receipt from public.nest_grocery_check_receipts
    where actor_id = v_actor and household_id = p_household and operation_id = p_operation;
  if found then
    if v_receipt.request is distinct from v_request then
      raise exception 'Operation payload changed' using errcode = '22023';
    end if;
    return v_receipt.result;
  end if;
  v_result := private.nest_apply_grocery_check(p_household,p_target,p_expected,p_checked)
    || jsonb_build_object('operation',p_operation);
  insert into public.nest_grocery_check_receipts(actor_id,household_id,operation_id,request,result)
    values(v_actor,p_household,p_operation,v_request,v_result);
  return v_result;
end;
$$;
revoke all on function private.nest_set_grocery_checked(uuid,uuid,uuid,bigint,boolean) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.nest_set_grocery_checked(uuid,uuid,uuid,bigint,boolean) to authenticated;
create function public.nest_set_grocery_checked(
  p_household uuid, p_operation uuid, p_target uuid, p_expected bigint, p_checked boolean
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.nest_set_grocery_checked($1,$2,$3,$4,$5);
$$;
revoke all on function public.nest_set_grocery_checked(uuid,uuid,uuid,bigint,boolean) from public, anon, authenticated;
grant execute on function public.nest_set_grocery_checked(uuid,uuid,uuid,bigint,boolean) to authenticated;
