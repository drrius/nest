create or replace function private.set_meals_groceries_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger meal_definitions_set_updated_at
before update on public.meal_definitions
for each row
execute function private.set_meals_groceries_updated_at();

create trigger meal_plan_entries_set_updated_at
before update on public.meal_plan_entries
for each row
execute function private.set_meals_groceries_updated_at();
