-- GATED additive candidate. Accepted responsibility is separate from recurrence planning.
alter table public.routine_occurrences
  add column nest_accepted_assignee_id uuid,
  add column nest_assignment_revision bigint not null default 0 check(nest_assignment_revision>=0),
  add foreign key(household_id,nest_accepted_assignee_id)
    references public.household_members(household_id,user_id),
  add check(nest_accepted_assignee_id is null or planned_assignee_id is not null);

create function private.nest_track_occurrence_assignment()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.planned_assignee_id is distinct from old.planned_assignee_id
    or new.routine_id is distinct from old.routine_id
    or new.household_id is distinct from old.household_id then
    new.nest_accepted_assignee_id:=null;
  end if;
  new.nest_assignment_revision:=old.nest_assignment_revision;
  if new.planned_assignee_id is distinct from old.planned_assignee_id
    or new.nest_accepted_assignee_id is distinct from old.nest_accepted_assignee_id
    or new.due_date is distinct from old.due_date or new.status is distinct from old.status
    or new.role is distinct from old.role or new.routine_id is distinct from old.routine_id
    or new.household_id is distinct from old.household_id then
    new.nest_assignment_revision:=old.nest_assignment_revision+1;
  end if;
  return new;
end;
$$;
revoke all on function private.nest_track_occurrence_assignment() from public,anon,authenticated;
create trigger nest_track_occurrence_assignment before update on public.routine_occurrences
  for each row execute function private.nest_track_occurrence_assignment();

create table public.nest_chore_transfers (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id),
  -- Immutable target identity survives a definition rebuild deleting the occurrence.
  occurrence_id uuid not null,
  expected_due_date date not null,
  expected_assignment_revision bigint not null check(expected_assignment_revision>=0),
  from_member_id uuid not null references auth.users(id),
  to_member_id uuid not null references auth.users(id),
  state text not null default 'pending' check(state in ('pending','accepted','declined','superseded')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check(from_member_id<>to_member_id),
  check((state='pending')=(resolved_at is null)),
  unique(household_id,id)
);
create unique index nest_one_pending_chore_transfer
  on public.nest_chore_transfers(household_id,occurrence_id) where state='pending';
alter table public.nest_chore_transfers enable row level security;
revoke all on public.nest_chore_transfers from public,anon,authenticated;
grant select on public.nest_chore_transfers to authenticated;
create policy household_chore_transfers on public.nest_chore_transfers for select to authenticated
  using((select private.is_household_member(household_id)));

create table public.nest_chore_transfer_receipts (
  actor_id uuid not null references auth.users(id),
  household_id uuid not null references public.households(id),
  operation_id uuid not null,
  request_hash bytea not null,
  result jsonb not null,
  primary key(actor_id,household_id,operation_id)
);
alter table public.nest_chore_transfer_receipts enable row level security;
revoke all on public.nest_chore_transfer_receipts from public,anon,authenticated;
grant select on public.nest_chore_transfer_receipts to authenticated;
create policy own_chore_transfer_receipts on public.nest_chore_transfer_receipts for select to authenticated
  using(actor_id=(select auth.uid()) and (select private.is_household_member(household_id)));
