create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_household_member(uuid) from public, anon;
grant execute on function private.is_household_member(uuid) to authenticated;

drop policy if exists "members can read their household" on public.households;
drop policy if exists "members can update their household" on public.households;
drop policy if exists "members can read household membership" on public.household_members;

create policy "members can read their household"
on public.households
for select
to authenticated
using ((select private.is_household_member(id)));

create policy "members can update their household"
on public.households
for update
to authenticated
using ((select private.is_household_member(id)))
with check ((select private.is_household_member(id)));

create policy "members can read household membership"
on public.household_members
for select
to authenticated
using ((select private.is_household_member(household_id)));

drop function public.is_household_member(uuid);

revoke all on table public.households from anon, authenticated;
revoke all on table public.household_members from anon, authenticated;

grant select on table public.households to authenticated;
grant update (name) on table public.households to authenticated;
grant select on table public.household_members to authenticated;

revoke all on table public.households from service_role;
revoke all on table public.household_members from service_role;

grant select, insert, update, delete on table public.households to service_role;
grant select, insert, update, delete on table public.household_members to service_role;

comment on schema private is 'Internal database helpers that are not exposed through the Data API.';
comment on function private.is_household_member(uuid) is 'RLS helper that checks the calling auth identity against relational household membership.';
