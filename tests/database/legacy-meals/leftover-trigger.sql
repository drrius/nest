create trigger meal_plan_entries_validate_leftover
before insert or update of household_id, date, leftover_of_entry_id
on public.meal_plan_entries
for each row
execute function private.validate_leftover_meal_plan_entry();
