-- Audited test-only source excerpts from household-os 4a528c9.
create table public.routine_completions (
  occurrence_id uuid primary key,
  household_id uuid not null,
  completed_by_member_id uuid not null,
  completed_at timestamptz not null default now(),
  completed_on date not null,
  note text check (note is null or length(note) <= 2000),
  photo_path text,
  foreign key (household_id, occurrence_id)
    references public.routine_occurrences(household_id, id),
  foreign key (household_id, completed_by_member_id)
    references public.household_members(household_id, user_id)
);
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
alter table public.routine_occurrences
  add column meal_plan_entry_id uuid;

alter table public.routine_occurrences
  add foreign key (household_id, meal_plan_entry_id)
  references public.meal_plan_entries(household_id, id);

create unique index routine_occurrences_meal_plan_entry_idx
  on public.routine_occurrences (meal_plan_entry_id)
  where meal_plan_entry_id is not null;