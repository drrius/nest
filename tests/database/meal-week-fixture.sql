-- Only Supabase infrastructure is simulated; tenancy and meal shapes are audited legacy SQL.
\ir conversation-fixture.sql
\ir legacy-meals/categories.sql
\ir legacy-meals/tables.sql
\ir legacy-meals/updated-at.sql
\ir legacy-meals/leftovers.sql
\ir legacy-meals/leftover-trigger.sql
\ir legacy-meals/read-policy.sql
-- Existing pre-migration rows exercise default revision zero without a data rewrite.
insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values
 ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000010','2026-09-21','dinner','Legacy soup'),
 ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000020','2026-09-21','lunch','Other home');
insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values
 ('00000000-0000-4000-8000-000000000106','00000000-0000-4000-8000-000000000010','infinity','dinner','Legacy unbounded date');
