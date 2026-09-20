alter table public.meal_plan_entries enable row level security;
create policy "members can read meal plan entries"
on public.meal_plan_entries for select to authenticated
using ((select private.is_household_member(household_id)));

revoke all on table public.meal_plan_entries from anon, authenticated;
grant select on table public.meal_plan_entries to authenticated;
