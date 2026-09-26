-- Disposable legacy chore fixture: only completion RPC dependencies.
create role service_role nologin bypassrls;
\ir ../../supabase/migrations/20260925185000_native_household_write_barrier.sql
\ir ../../supabase/migrations/20260925202107_native_offline_cutover_epoch.sql
\ir ../../supabase/migrations/20260925202807_native_chore_epoch_command.sql
