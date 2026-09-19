-- Isolated synthetic membership fixture. No production rows or credentials.
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
