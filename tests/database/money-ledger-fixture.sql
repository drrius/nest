-- Disposable synthetic fixture only. No production connection or migration.
\ir busy-fixture.sql
-- FK-only interfaces. No shopping or draft behavior is simulated.
create table public.shopping_sessions (
  id uuid primary key, household_id uuid not null references public.households(id),
  unique(household_id,id)
);
create table public.expense_drafts (
  id uuid primary key, household_id uuid not null references public.households(id),
  unique(household_id,id)
);
\ir legacy-money/tables.sql
\ir legacy-money/history-guards.sql
\ir legacy-money/read-access.sql
-- Category reads only: creation/editing/default seeding are outside this fixture's scope.
grant select on public.expense_categories to authenticated;
