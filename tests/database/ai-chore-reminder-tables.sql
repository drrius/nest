-- Exact audited routine-table subset from legacy-routines/tables.sql.
-- activity_events already exists in the real financial/AI fixture chain.
-- Audited test-only source excerpts from household-os 4a528c9.
-- Native creation subset; not a full legacy closure/edit engine rehearsal.
create table public.areas (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  sort_order integer not null check (sort_order >= 0),
  archived_at timestamptz,
  unique (household_id, id),
  unique (household_id, name)
);

create table public.pets (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  photo_path text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

create table public.routines (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  instructions text check (instructions is null or length(instructions) <= 4000),
  area_id uuid not null,
  pet_id uuid,
  assignment_policy text not null
    check (assignment_policy in ('assigned', 'alternating', 'shared')),
  assigned_member_id uuid,
  rotation_anchor_member_id uuid,
  schedule_kind text not null
    check (schedule_kind in ('one_off', 'calendar', 'after_completion')),
  schedule_rule jsonb not null,
  priority text not null default 'general'
    check (priority in ('pet_care', 'meal_deadline', 'cleaning', 'general')),
  active_from date,
  active_until date,
  paused_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, area_id)
    references public.areas(household_id, id),
  foreign key (household_id, pet_id)
    references public.pets(household_id, id),
  foreign key (household_id, assigned_member_id)
    references public.household_members(household_id, user_id),
  foreign key (household_id, rotation_anchor_member_id)
    references public.household_members(household_id, user_id),
  check (
    (
      assignment_policy = 'assigned'
      and assigned_member_id is not null
      and rotation_anchor_member_id is null
    )
    or (
      assignment_policy = 'alternating'
      and assigned_member_id is null
      and rotation_anchor_member_id is not null
    )
    or (
      assignment_policy = 'shared'
      and assigned_member_id is null
      and rotation_anchor_member_id is null
    )
  ),
  check (private.is_valid_routine_schedule(schedule_kind, schedule_rule)),
  check (active_until is null or active_from is null or active_until >= active_from)
);

create table public.routine_occurrences (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  routine_id uuid not null,
  due_date date not null,
  original_due_date date not null,
  planned_assignee_id uuid,
  status text not null check (status in ('open', 'completed', 'skipped')),
  role text,
  rescheduled_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, routine_id)
    references public.routines(household_id, id) on delete cascade,
  foreign key (household_id, planned_assignee_id)
    references public.household_members(household_id, user_id),
  check (
    (status = 'open' and role in ('current', 'preview') and closed_at is null)
    or
    (status in ('completed', 'skipped') and role is null and closed_at is not null)
  )
);

create table public.routine_reminder_preferences (
  routine_id uuid not null,
  member_id uuid not null,
  household_id uuid not null,
  enabled boolean not null default false,
  due_day_local_time time not null default '09:00',
  primary key (routine_id, member_id),
  unique (household_id, routine_id, member_id),
  foreign key (household_id, routine_id)
    references public.routines(household_id, id) on delete cascade,
  foreign key (household_id, member_id)
    references public.household_members(household_id, user_id)
);

create table public.reminder_candidates (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null,
  occurrence_id uuid not null,
  remind_on date not null,
  remind_local_time time not null,
  status text not null default 'pending'
    check (status in ('pending', 'cancelled', 'delivered')),
  created_at timestamptz not null default now(),
  unique (household_id, member_id, occurrence_id),
  foreign key (household_id, member_id)
    references public.household_members(household_id, user_id),
  foreign key (household_id, occurrence_id)
    references public.routine_occurrences(household_id, id) on delete cascade
);
create unique index routine_occurrences_one_open_current_idx
  on public.routine_occurrences (routine_id)
  where status = 'open' and role = 'current';

create unique index routine_occurrences_one_open_preview_idx
  on public.routine_occurrences (routine_id)
  where status = 'open' and role = 'preview';

create index routine_occurrences_household_due_idx
  on public.routine_occurrences (household_id, due_date)
  where status = 'open';


-- Same legacy read protections as routine-creation-fixture.sql.
alter table public.routines enable row level security;
alter table public.routine_occurrences enable row level security;
alter table public.areas enable row level security;
alter table public.pets enable row level security;
alter table public.routine_reminder_preferences enable row level security;
alter table public.reminder_candidates enable row level security;
create policy members_read_routines on public.routines for select to authenticated
  using ((select private.is_household_member(household_id)));
create policy members_read_occurrences on public.routine_occurrences for select to authenticated
  using ((select private.is_household_member(household_id)));
grant select on public.routines,public.routine_occurrences to authenticated;
