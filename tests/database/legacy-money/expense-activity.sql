create table public.activity_events (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  actor_member_id uuid not null,
  kind text not null check (
    kind in (
      'routine_created',
      'routine_updated',
      'occurrence_completed',
      'occurrence_skipped',
      'occurrence_rescheduled',
      'routine_paused',
      'routine_unpaused',
      'routine_archived'
    )
  ),
  entity_type text not null
    check (entity_type in ('routine', 'routine_occurrence')),
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (household_id, actor_member_id)
    references public.household_members(household_id, user_id)
);

create index activity_events_household_created_idx
  on public.activity_events (household_id, created_at desc);
