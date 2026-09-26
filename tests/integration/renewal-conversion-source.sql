-- Audited legacy commitment columns/constraints; unrelated contacts FK omitted in this isolated fixture.
create table public.household_commitments (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, created_by) references public.household_members(household_id, user_id),
  title text not null check (length(trim(title)) between 1 and 160),
  provider text not null default '' check (length(provider) <= 200),
  status text not null default 'active' check (status in ('active', 'cancel_requested', 'ended')),
  responsible_member_id uuid,
  renewal_on date,
  notice_days integer not null default 0 check (notice_days between 0 and 730),
  expected_amount_cents bigint check (expected_amount_cents between 0 and 9007199254740991),
  billing_interval text not null default 'monthly' check (billing_interval in ('weekly', 'monthly', 'yearly', 'one_off')),
  recurring_expense_rule_id uuid,
  contact_id uuid,
  website text not null default '' check (length(website) <= 2000),
  notes text not null default '' check (length(notes) <= 8000),
  archived_at timestamptz,
  foreign key (household_id, responsible_member_id) references public.household_members(household_id, user_id),
  foreign key (household_id, recurring_expense_rule_id) references public.recurring_expense_rules(household_id, id)
);
alter table public.household_commitments enable row level security;
