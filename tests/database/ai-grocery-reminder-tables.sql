-- Audited grocery fixture shape, excluding existing tenancy infrastructure.
create table public.grocery_items (
  id uuid primary key, household_id uuid not null, name text not null,
  state text not null default 'active', claimed_by_session_id uuid,
  purchased_at timestamptz, removed_at timestamptz
);
-- Audited additions from legacy 20260811180000_meals_groceries.sql. Synthetic IDs only.
create table public.grocery_categories (
  id uuid primary key, household_id uuid not null, name text not null,
  archived_at timestamptz, unique(household_id,id)
);
alter table public.grocery_categories enable row level security;
revoke all on public.grocery_categories from public,anon,authenticated;
insert into public.grocery_categories values
 ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','Produce',null),
 ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000020','Private',null),
 ('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000010','Archived',now());
alter table public.grocery_items
 add column quantity text check(quantity is null or length(quantity)<=80),
 add column unit text check(unit is null or length(unit)<=80),
 add column category_id uuid,
 add column note text,
 add column originating_meal_plan_entry_id uuid,
 add column sort_order integer not null default 0 check(sort_order>=0),
 add column created_at timestamptz not null default now(),
 add column updated_at timestamptz not null default now(),
 add foreign key(household_id,category_id) references public.grocery_categories(household_id,id),
 add check(length(trim(name)) between 1 and 120),
 add check(
   (state='active' and claimed_by_session_id is null and purchased_at is null and removed_at is null)
   or (state='claimed' and claimed_by_session_id is not null and purchased_at is null and removed_at is null)
   or (state='purchased' and claimed_by_session_id is null and purchased_at is not null and removed_at is null)
   or (state='removed' and claimed_by_session_id is null and purchased_at is null and removed_at is not null)
 );
