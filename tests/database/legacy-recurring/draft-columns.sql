-- Expand the existing FK-only draft fixture to the audited legacy read interface.
-- Full original schema: 20260811180000_meals_groceries.sql; recurring/category
-- additions and occurrence uniqueness: 20260811200000_chf_ledger.sql.
alter table public.expense_drafts
  add column source_kind text not null default 'recurring' check(source_kind in ('shopping','recurring')),
  add column shopping_session_id uuid unique,
  add column description text not null default 'Fixture draft' check(length(trim(description)) between 1 and 200),
  add column amount_cents bigint check(amount_cents between 0 and 9007199254740991),
  add column payer_member_id uuid,
  add column proposed_allocations jsonb not null default '[]'::jsonb check(jsonb_typeof(proposed_allocations)='array'),
  add column occurred_on date not null default current_date,
  add column status text not null default 'pending' check(status in ('pending','posted','dismissed')),
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column recurring_expense_rule_id uuid,
  add column category_id uuid,
  add foreign key(household_id,recurring_expense_rule_id) references public.recurring_expense_rules(household_id,id),
  add foreign key(household_id,payer_member_id) references public.household_members(household_id,user_id),
  add foreign key(household_id,category_id) references public.expense_categories(household_id,id),
  add foreign key(household_id,shopping_session_id) references public.shopping_sessions(household_id,id),
  add check((source_kind='shopping' and shopping_session_id is not null) or (source_kind='recurring' and shopping_session_id is null));
create unique index expense_drafts_rule_occurrence_idx on public.expense_drafts(recurring_expense_rule_id,occurred_on) where recurring_expense_rule_id is not null;
