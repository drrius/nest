-- Extend the old completion-adapter fixture for the real handover read command.
-- This supplies only missing tenancy FK targets; it is not recurrence verification.
create schema extensions;
create extension pgcrypto with schema extensions;
create table public.households(id uuid primary key);
insert into public.households select distinct household_id from public.household_members;
create table auth.users(id uuid primary key);
insert into auth.users select user_id from public.household_members;
alter table public.routine_occurrences drop column nest_accepted_assignee_id;
\ir ../../supabase/migrations/20260920143047_native_chore_transfer_storage.sql
\ir ../../supabase/migrations/20260920143104_native_chore_transfer_commands.sql
