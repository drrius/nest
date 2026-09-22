-- Audited verbatim legacy rule DDL from 20260811200000_chf_ledger.sql. Fixture only.
create table public.recurring_expense_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 200),
  amount_cents bigint not null
    check (amount_cents between 0 and 9007199254740991),
  payer_member_id uuid not null,
  proposed_allocations jsonb not null
    check (jsonb_typeof(proposed_allocations) = 'array'),
  category_id uuid,
  schedule_kind text not null check (schedule_kind in ('weekly', 'monthly')),
  iso_weekday smallint check (iso_weekday between 1 and 7),
  day_of_month smallint check (day_of_month between 1 and 31),
  active boolean not null default true,
  next_occurrence_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, payer_member_id)
    references public.household_members(household_id, user_id),
  foreign key (household_id, category_id)
    references public.expense_categories(household_id, id),
  check (
    (schedule_kind = 'weekly' and iso_weekday is not null and day_of_month is null)
    or (
      schedule_kind = 'monthly'
      and iso_weekday is null
      and day_of_month is not null
    )
  )
);

alter table public.recurring_expense_rules enable row level security;
