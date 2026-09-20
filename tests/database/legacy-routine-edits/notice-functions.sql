-- Audited test-only source excerpts from household-os 4a528c9.
create or replace function private.member_belongs_to_household(
  p_household_id uuid,
  p_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members as member
    where member.household_id = p_household_id
      and member.user_id = p_member_id
  );
$$;

create or replace function private.affected_members_for_routine_change(
  p_old_assigned_member_id uuid,
  p_old_assignment_policy text,
  p_new_assigned_member_id uuid,
  p_new_assignment_policy text,
  p_household_id uuid
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  affected_member_ids uuid[];
begin
  if p_old_assignment_policy in ('alternating', 'shared')
    or p_new_assignment_policy in ('alternating', 'shared')
  then
    select coalesce(
      array_agg(member.user_id order by member.user_id),
      '{}'::uuid[]
    )
    into affected_member_ids
    from public.household_members as member
    where member.household_id = p_household_id;
    return affected_member_ids;
  end if;

  select coalesce(array_agg(member_id order by member_id), '{}'::uuid[])
  into affected_member_ids
  from (
    select distinct candidate.member_id
    from unnest(
      array[p_old_assigned_member_id, p_new_assigned_member_id]
    ) as candidate(member_id)
    join public.household_members as member
      on member.household_id = p_household_id
      and member.user_id = candidate.member_id
    where candidate.member_id is not null
  ) as affected;

  return affected_member_ids;
end;
$$;

create or replace function private.insert_partner_inbox_and_outbox(
  p_household_id uuid,
  p_recipient_member_id uuid,
  p_actor_member_id uuid,
  p_activity_kind text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_activity_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inbox_id uuid;
  dedupe text;
  has_subscription boolean;
  outbox_status text;
begin
  if p_recipient_member_id = p_actor_member_id then
    return;
  end if;
  if not private.member_belongs_to_household(p_household_id, p_recipient_member_id) then
    return;
  end if;
  if p_activity_event_id is null then
    raise exception 'activity_event_id is required for partner notice dedupe'
      using errcode = '22023';
  end if;

  -- Per mutation: same entity can emit many routine_updated / reschedule events.
  dedupe :=
    'partner:'
    || p_activity_kind
    || ':'
    || p_entity_id::text
    || ':'
    || p_activity_event_id::text;

  insert into public.inbox_notifications (
    household_id,
    recipient_member_id,
    actor_member_id,
    kind,
    activity_kind,
    entity_type,
    entity_id,
    payload,
    dedupe_key
  )
  values (
    p_household_id,
    p_recipient_member_id,
    p_actor_member_id,
    'partner_notice',
    p_activity_kind,
    p_entity_type,
    p_entity_id,
    coalesce(p_payload, '{}'::jsonb),
    dedupe
  )
  on conflict (household_id, recipient_member_id, dedupe_key) do nothing
  returning id into inbox_id;

  if inbox_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.push_subscriptions as subscription
    where subscription.household_id = p_household_id
      and subscription.member_id = p_recipient_member_id
      and subscription.disabled_at is null
  )
  into has_subscription;

  outbox_status := case
    when has_subscription then 'pending'
    else 'skipped_no_subscription'
  end;

  insert into public.push_outbox (
    household_id,
    recipient_member_id,
    inbox_notification_id,
    status,
    processed_at
  )
  values (
    p_household_id,
    p_recipient_member_id,
    inbox_id,
    outbox_status,
    case when outbox_status = 'skipped_no_subscription' then now() else null end
  );
end;
$$;

create or replace function private.cancel_inbox_reminder_for_occurrence(
  p_occurrence_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.inbox_notifications as inbox
  where inbox.kind = 'routine_reminder'
    and inbox.dedupe_key = 'reminder:' || p_occurrence_id::text
    and inbox.read_at is null;
end;
$$;
