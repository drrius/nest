create table public.expense_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  sort_order integer not null check (sort_order >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

create unique index expense_categories_active_name_idx
  on public.expense_categories (household_id, name)
  where archived_at is null;

create table public.financial_events (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (
    type in (
      'opening_balance',
      'expense',
      'refund',
      'settlement',
      'reversal',
      'replacement'
    )
  ),
  occurred_on date not null,
  created_at timestamptz not null default now(),
  created_by_member_id uuid not null,
  payer_member_id uuid,
  description text not null check (length(trim(description)) between 1 and 200),
  amount_cents bigint not null
    check (amount_cents between 0 and 9007199254740991),
  related_event_id uuid,
  category_id uuid,
  note text check (note is null or length(note) <= 4000),
  receipt_path text check (receipt_path is null or length(receipt_path) <= 2000),
  shopping_session_id uuid,
  expense_draft_id uuid unique,
  unique (household_id, id),
  foreign key (household_id, created_by_member_id)
    references public.household_members(household_id, user_id),
  foreign key (household_id, payer_member_id)
    references public.household_members(household_id, user_id),
  foreign key (household_id, related_event_id)
    references public.financial_events(household_id, id),
  foreign key (household_id, category_id)
    references public.expense_categories(household_id, id),
  foreign key (household_id, shopping_session_id)
    references public.shopping_sessions(household_id, id),
  foreign key (household_id, expense_draft_id)
    references public.expense_drafts(household_id, id),
  check (
    (type = 'reversal' and payer_member_id is null)
    or (type <> 'reversal' and payer_member_id is not null)
  ),
  check (
    (type in ('refund', 'reversal', 'replacement') and related_event_id is not null)
    or (
      type in ('opening_balance', 'expense', 'settlement')
      and related_event_id is null
    )
  )
);

create unique index financial_events_one_opening_balance_idx
  on public.financial_events (household_id)
  where type = 'opening_balance';

create unique index financial_events_one_reversal_idx
  on public.financial_events (related_event_id)
  where type = 'reversal';

create index financial_events_household_occurred_idx
  on public.financial_events (household_id, occurred_on desc, created_at desc);

create table public.financial_allocations (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  financial_event_id uuid not null,
  member_id uuid not null,
  allocated_cents bigint not null
    check (allocated_cents between 0 and 9007199254740991),
  unique (household_id, id),
  unique (financial_event_id, member_id),
  foreign key (household_id, financial_event_id)
    references public.financial_events(household_id, id),
  foreign key (household_id, member_id)
    references public.household_members(household_id, user_id)
);

create table public.ledger_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  financial_event_id uuid not null,
  member_id uuid not null,
  receivable_delta_cents bigint not null
    check (
      receivable_delta_cents between -9007199254740991 and 9007199254740991
    ),
  created_at timestamptz not null default now(),
  unique (household_id, id),
  unique (financial_event_id, member_id),
  foreign key (household_id, financial_event_id)
    references public.financial_events(household_id, id),
  foreign key (household_id, member_id)
    references public.household_members(household_id, user_id)
);

create index ledger_entries_household_member_idx
  on public.ledger_entries (household_id, member_id);
