-- Audited test-only source: household-os 4a528c9.
-- Receipt FK includes the 20260830220000 nullable ON DELETE amendment.
create table public.routine_command_receipts (
  household_id uuid not null references public.households(id) on delete cascade,
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 200),
  command_kind text not null
    check (command_kind in ('complete', 'skip', 'reschedule')),
  occurrence_id uuid,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (household_id, idempotency_key),
  foreign key (household_id, occurrence_id)
    references public.routine_occurrences(household_id, id) on delete set null (occurrence_id)
);
create or replace function public.complete_occurrence(
  p_occurrence_id uuid,
  p_idempotency_key text,
  p_completed_on date,
  p_note text default null,
  p_photo_path text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.apply_routine_closure(
    p_occurrence_id,
    p_idempotency_key,
    'complete',
    p_completed_on,
    null,
    p_note,
    p_photo_path
  );
$$;

create or replace function public.skip_occurrence(
  p_occurrence_id uuid,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.apply_routine_closure(
    p_occurrence_id,
    p_idempotency_key,
    'skip',
    null,
    null,
    null,
    null
  );
$$;

create or replace function public.reschedule_occurrence(
  p_occurrence_id uuid,
  p_new_due_date date,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.apply_routine_closure(
    p_occurrence_id,
    p_idempotency_key,
    'reschedule',
    null,
    p_new_due_date,
    null,
    null
  );
$$;

alter table public.routine_command_receipts enable row level security;
revoke all on function private.apply_routine_closure(uuid,text,text,date,date,text,text) from public,anon,authenticated;
revoke all on function public.complete_occurrence(uuid,text,date,text,text) from public,anon;
revoke all on function public.skip_occurrence(uuid,text) from public,anon;
revoke all on function public.reschedule_occurrence(uuid,date,text) from public,anon;
grant execute on function public.complete_occurrence(uuid,text,date,text,text) to authenticated;
grant execute on function public.skip_occurrence(uuid,text) to authenticated;
grant execute on function public.reschedule_occurrence(uuid,date,text) to authenticated;
