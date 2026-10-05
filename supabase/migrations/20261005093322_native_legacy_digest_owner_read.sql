-- GATED: retain every preference row and write rule; make old reads owner-only.
drop policy "members read household digest preferences"
  on public.notification_digest_preferences;
create policy "members read own digest preferences"
  on public.notification_digest_preferences for select to authenticated
  using (member_id=(select auth.uid()) and private.is_household_member(household_id));
