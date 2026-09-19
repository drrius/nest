create extension if not exists pgcrypto with schema extensions;

create table public.households (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  timezone text not null default 'Europe/Zurich' check (timezone = 'Europe/Zurich'),
  currency text not null default 'CHF' check (currency = 'CHF'),
  created_at timestamptz not null default now(),
  reset_at timestamptz
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  photo_path text,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create index household_members_user_household_idx
  on public.household_members (user_id, household_id);

alter table public.households enable row level security;
alter table public.household_members enable row level security;

create or replace function public.is_household_member(target_household_id uuid)
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

revoke all on function public.is_household_member(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;

create policy "members can read their household"
on public.households
for select
to authenticated
using ((select public.is_household_member(id)));

create policy "members can update their household"
on public.households
for update
to authenticated
using ((select public.is_household_member(id)))
with check ((select public.is_household_member(id)));

create policy "members can read household membership"
on public.household_members
for select
to authenticated
using ((select public.is_household_member(household_id)));

comment on table public.households is 'Version-one tenancy root. Created and reset only by trusted administration.';
comment on table public.household_members is 'Exactly two equal members per configured version-one household.';
comment on function public.is_household_member(uuid) is 'RLS helper isolated from household_members policy recursion.';
