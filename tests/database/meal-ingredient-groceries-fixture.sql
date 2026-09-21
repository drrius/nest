-- Audited legacy columns used by the ingredient writer, synthetic fixtures only.
alter table public.grocery_items
  add column quantity text check(length(quantity)<=80),
  add column unit text check(length(unit)<=80),
  add column category_id uuid,
  add column note text check(length(note)<=1000),
  add column originating_meal_plan_entry_id uuid,
  add column sort_order integer not null default 0,
  add constraint fixture_name check(length(trim(name)) between 1 and 120);
