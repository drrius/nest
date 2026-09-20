-- Audited legacy edit dependencies; no hosted data or migration execution.
\ir routine-creation-fixture.sql
\ir legacy-routine-edits/edit-tables.sql
\ir legacy-routine-edits/notice-tables.sql
\ir legacy-routine-edits/notice-functions.sql
\ir legacy-routine-edits/notice-delivery.sql
\ir legacy-routine-edits/window.sql
\ir legacy-routine-edits/definition.sql
\ir legacy-routine-edits/edit-version.sql
-- Keep the isolated fixture's supporting tables inaccessible to direct clients.
alter table public.routine_completions enable row level security;
alter table public.meal_definitions enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.inbox_notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.is_valid_routine_schedule(text,jsonb) to authenticated;
