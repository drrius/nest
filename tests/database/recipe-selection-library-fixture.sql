-- Extend the audited routine/meal fixture with the exact audited ingredient table from legacy-meals/tables.sql.
\ir legacy-meals/categories.sql
alter table public.grocery_categories enable row level security;
create table public.meal_grocery_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  meal_definition_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  quantity text check (quantity is null or length(quantity) <= 80),
  unit text check (unit is null or length(unit) <= 80),
  grocery_category_id uuid,
  note text check (note is null or length(note) <= 1000),
  sort_order integer not null check (sort_order >= 0),
  unique (household_id, id),
  foreign key (household_id, meal_definition_id)
    references public.meal_definitions(household_id, id) on delete cascade,
  foreign key (household_id, grocery_category_id)
    references public.grocery_categories(household_id, id)
);
