-- Deliberately audited minimal legacy shape/column grants; no production records.
create schema auth;
create schema private;
create role anon nologin;
create role authenticated nologin;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon;
create table public.household_members (household_id uuid not null, user_id uuid not null,
  primary key(household_id,user_id));
alter table public.household_members enable row level security;
create policy own_membership on public.household_members for select to authenticated using(user_id=auth.uid());
grant select on public.household_members to authenticated;
insert into public.household_members values
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000003');
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
