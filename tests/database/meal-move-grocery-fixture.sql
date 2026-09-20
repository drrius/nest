-- Audited grocery shape/policies reused from grocery-fixture.sql; fixture data only.
create table public.grocery_items (
  id uuid primary key, household_id uuid not null, name text not null,
  state text not null default 'active', claimed_by_session_id uuid,
  purchased_at timestamptz, removed_at timestamptz
);
alter table public.grocery_items enable row level security;
create policy member_groceries on public.grocery_items for all to authenticated using(exists(
  select 1 from public.household_members m where m.household_id=grocery_items.household_id and m.user_id=auth.uid()))
  with check(exists(select 1 from public.household_members m where m.household_id=grocery_items.household_id and m.user_id=auth.uid()));
grant select on public.grocery_items to authenticated;
grant update(name) on public.grocery_items to authenticated;
