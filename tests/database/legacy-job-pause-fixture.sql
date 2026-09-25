-- Audited job-claim DDL from legacy 20260812090000_notifications_realtime.sql.
create schema private;
create role anon; create role authenticated; create role service_role;
create table public.job_claims (
  schedule_key text primary key
    check (length(trim(schedule_key)) between 1 and 300),
  job_kind text not null
    check (
      job_kind in (
        'deliver_due_reminders',
        'deliver_member_digests',
        'ensure_due_occurrences',
        'generate_recurring_drafts_cron',
        'retain_activity_events',
        'retain_purchased_groceries',
        'drain_push_outbox'
      )
    ),
  status text not null check (status in ('started', 'succeeded', 'failed')),
  attempt_count integer not null default 1 check (attempt_count >= 1),
  result jsonb,
  last_error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  check (
    (status = 'started' and finished_at is null)
    or status <> 'started'
  )
);
