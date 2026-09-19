-- Only Supabase-owned infrastructure is simulated. Application tenancy SQL is audited source.
create schema auth;
create schema extensions;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon;
\ir legacy-tenancy/20260809100000_core_tenancy.sql
\ir legacy-tenancy/20260809190100_harden_core_tenancy.sql
\ir legacy-tenancy/20260809201000_household_member_cap.sql
insert into auth.users values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003');
insert into public.households(id,name) values
 ('00000000-0000-4000-8000-000000000010','Fixture household'),
 ('00000000-0000-4000-8000-000000000020','Other fixture household');
insert into public.household_members(household_id,user_id,display_name) values
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','First'),
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','Second'),
 ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000003','Other');
