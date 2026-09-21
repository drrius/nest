-- Remaining audited legacy checklist columns in the ingredient fixture only.
alter table public.grocery_items
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
