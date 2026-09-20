\ir grocery-edit-fixture.sql
-- Combined synthetic command adapters, not a full legacy recurrence-engine proof.
create function private.is_household_member(target uuid) returns boolean
language sql security definer stable set search_path='' as $$
  select exists(select 1 from public.household_members where household_id=target and user_id=auth.uid());
$$;
revoke all on function private.is_household_member(uuid) from public,anon;
grant execute on function private.is_household_member(uuid) to authenticated;
create function private.household_today() returns date language sql stable set search_path='' as $$
  select (now() at time zone 'Europe/Zurich')::date;
$$;
create table public.routine_occurrences (
  id uuid primary key, household_id uuid not null, due_date date not null,
  status text not null, role text
);
alter table public.routine_occurrences enable row level security;
create policy own_occurrences on public.routine_occurrences for select to authenticated
  using(private.is_household_member(household_id));
grant select on public.routine_occurrences to authenticated;
create table public.routine_completions (
  occurrence_id uuid primary key references public.routine_occurrences(id),
  completed_by_member_id uuid not null, completed_on date not null
);
alter table public.routine_completions enable row level security;
create table private.fixture_closure_calls (occurrence_id uuid, retry_key text);
-- Real SQL fixture closure: intentionally no recurrence/window simulation.
create function public.complete_occurrence(uuid, text, date, text, text)
  returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into private.fixture_closure_calls values ($1, $2);
  update public.routine_occurrences set status='completed', role=null where id=$1;
  insert into public.routine_completions values($1, auth.uid(), $3);
  return jsonb_build_object('occurrence_id', $1);
end;
$$;
revoke all on function public.complete_occurrence(uuid,text,date,text,text) from public, anon, authenticated;

insert into public.routine_occurrences values
 ('00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000010','2026-09-19','open','current'),
 ('00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000020','2026-09-19','open','current');
