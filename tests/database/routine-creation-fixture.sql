-- Existing audited tenancy plus deliberately selected actual routine SQL.
\ir conversation-fixture.sql
\ir legacy-routines/schedule-validation.sql
\ir legacy-routines/tables.sql
\ir legacy-routines/dates.sql
\ir legacy-routines/insertion.sql
-- Apply the legacy read policies; final legacy permissions revoke direct definition writes.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.is_valid_routine_schedule(text,jsonb) to authenticated;
alter table public.routines enable row level security;
alter table public.routine_occurrences enable row level security;
alter table public.areas enable row level security;
alter table public.pets enable row level security;
alter table public.activity_events enable row level security;
alter table public.routine_reminder_preferences enable row level security;
alter table public.reminder_candidates enable row level security;
create policy "members can read routines" on public.routines for select to authenticated
  using ((select private.is_household_member(household_id)));
create policy "members can read routine occurrences" on public.routine_occurrences for select to authenticated
  using ((select private.is_household_member(household_id)));
grant select on public.routines,public.routine_occurrences to authenticated;
