-- Disposable legacy chore fixture: only completion RPC dependencies.
create role service_role nologin bypassrls;
create schema extensions;
create function extensions.gen_random_uuid() returns uuid language sql as 'select gen_random_uuid()';
alter table public.routine_occurrences add column original_due_date date;
update public.routine_occurrences set original_due_date=due_date;
\ir ../../supabase/migrations/20260920104931_native_completion_closure_guards.sql
\ir ../../supabase/migrations/20260925185000_native_household_write_barrier.sql
\ir ../../supabase/migrations/20260925202107_native_offline_cutover_epoch.sql
\ir ../../supabase/migrations/20260925202807_native_chore_epoch_command.sql
