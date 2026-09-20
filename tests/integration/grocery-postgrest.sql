-- Fixture bridge for actual PostgREST JWT claims and audited category read policy.
create or replace function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
$$;

alter table public.household_members add column display_name text not null default 'Fixture member';
alter table public.grocery_categories add column sort_order integer not null default 0;
grant select on public.grocery_categories to authenticated;
create policy member_categories on public.grocery_categories for select to authenticated using(exists(
  select 1 from public.household_members m where m.household_id=grocery_categories.household_id and m.user_id=auth.uid()));
