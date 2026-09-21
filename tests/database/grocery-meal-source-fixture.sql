-- Audited provenance projection of legacy meal_plan_entries; fixtures only.
create role service_role nologin;
create table public.meal_plan_entries (
  id uuid primary key, household_id uuid not null, title_snapshot text not null,
  date date, slot text
);
alter table public.meal_plan_entries enable row level security;
revoke all on public.meal_plan_entries from public,anon,authenticated;
