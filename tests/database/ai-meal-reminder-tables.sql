-- Audited legacy meal definitions and entries for the synthetic journal fixture.
create table public.meal_definitions (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  recipe_url text check (recipe_url is null or length(recipe_url) <= 2000),
  notes text check (notes is null or length(notes) <= 4000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);

create table public.meal_plan_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  slot text check (slot in ('breakfast', 'lunch', 'dinner')),
  meal_definition_id uuid,
  title_snapshot text not null check (length(trim(title_snapshot)) between 1 and 120),
  recipe_url_snapshot text
    check (recipe_url_snapshot is null or length(recipe_url_snapshot) <= 2000),
  notes text check (notes is null or length(notes) <= 4000),
  leftover_of_entry_id uuid,
  groceries_materialized_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, meal_definition_id)
    references public.meal_definitions(household_id, id),
  foreign key (household_id, leftover_of_entry_id)
    references public.meal_plan_entries(household_id, id),
  check (slot is not null or extract(isodow from date) = 1),
  check (leftover_of_entry_id is null or leftover_of_entry_id <> id)
);

create unique index meal_plan_entries_active_slot_idx
  on public.meal_plan_entries (household_id, date, slot)
  where slot is not null and removed_at is null;
