-- Audited test-only source excerpts from household-os 4a528c9.
create table public.inbox_notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipient_member_id uuid not null,
  actor_member_id uuid,
  kind text not null
    check (kind in ('partner_notice', 'routine_reminder', 'household_digest')),
  activity_kind text,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, id),
  unique (household_id, recipient_member_id, dedupe_key),
  check (actor_member_id is null or recipient_member_id <> actor_member_id),
  foreign key (household_id, recipient_member_id)
    references public.household_members(household_id, user_id),
  foreign key (household_id, actor_member_id)
    references public.household_members(household_id, user_id)
);

create table public.push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null,
  member_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  unique (endpoint),
  unique (household_id, id),
  foreign key (household_id, member_id)
    references public.household_members(household_id, user_id) on delete cascade
);

create table public.push_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  recipient_member_id uuid not null,
  inbox_notification_id uuid not null,
  status text not null default 'pending'
    check (
      status in ('pending', 'sent', 'skipped_no_subscription', 'failed')
    ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (inbox_notification_id),
  foreign key (household_id, recipient_member_id)
    references public.household_members(household_id, user_id),
  foreign key (household_id, inbox_notification_id)
    references public.inbox_notifications(household_id, id) on delete cascade
);
