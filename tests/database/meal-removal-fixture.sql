-- Real audited meal table shapes and preparation closure, not a closure stub.
\ir routine-closure-fixture.sql
\ir legacy-meals/updated-at.sql
\ir legacy-meals/leftovers.sql
\ir legacy-meals/leftover-trigger.sql
\ir legacy-meals/read-policy.sql
create unique index meal_plan_entries_active_slot_idx
  on public.meal_plan_entries(household_id,date,slot)
  where slot is not null and removed_at is null;
