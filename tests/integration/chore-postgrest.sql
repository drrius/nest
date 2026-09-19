-- Extends only the disposable chore fixture; never apply to an existing database.
create or replace function auth.uid() returns uuid language sql stable as $$
  select (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
$$;
create table public.routines (
  id uuid primary key, household_id uuid not null, title text not null,
  archived_at timestamptz, unique(household_id, id)
);
alter table public.routines enable row level security;
create policy household_routines on public.routines for select to authenticated
  using(private.is_household_member(household_id));
grant select on public.routines to authenticated;
insert into public.routines values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','Water plants',null),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','Private other home',null);
alter table public.routine_occurrences add column routine_id uuid;
alter table public.routine_occurrences add column planned_assignee_id uuid;
update public.routine_occurrences set routine_id='10000000-0000-4000-8000-000000000001';
alter table public.routine_occurrences alter column routine_id set not null;
alter table public.routine_occurrences add foreign key(household_id,routine_id)
  references public.routines(household_id,id);
insert into public.routine_occurrences values
 ('00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000020',
  '2026-09-19','open','current','10000000-0000-4000-8000-000000000002',null);
