-- Audited test-only source excerpts from household-os 4a528c9.
create or replace function private.deliver_partner_notice(
  p_household_id uuid,
  p_actor_member_id uuid,
  p_activity_kind text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_activity_event_id uuid,
  p_affect_member_ids uuid[] default array[]::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule_outcome text;
  recipient uuid;
  other uuid;
begin
  if not private.member_belongs_to_household(
    p_household_id,
    p_actor_member_id
  ) then
    raise exception 'notification actor is not a member of household %',
      p_household_id
      using errcode = '42501';
  end if;

  rule_outcome := case p_activity_kind
    when 'project_record_changed' then 'activity_only'
    when 'project_task_assigned' then 'notify_affected_members'
    when 'occurrence_completed' then 'activity_only'
    when 'occurrence_skipped' then 'activity_only'
    when 'meal_plan_entry_created' then 'activity_only'
    when 'meal_plan_entry_updated' then 'activity_only'
    when 'meal_plan_entry_removed' then 'activity_only'
    when 'routine_created' then 'activity_only'
    when 'routine_paused' then 'activity_only'
    when 'routine_unpaused' then 'activity_only'
    when 'routine_archived' then 'activity_only'
    when 'expense_draft_dismissed' then 'activity_only'
    when 'recurring_expense_rule_created' then 'activity_only'
    when 'recurring_expense_rule_updated' then 'activity_only'
    when 'recurring_drafts_generated' then 'activity_only'
    when 'routine_updated' then 'notify_affected_members'
    when 'occurrence_rescheduled' then 'notify_affected_members'
    when 'shopping_session_finished' then 'notify_other_member'
    when 'opening_balance_established' then 'notify_other_member'
    when 'expense_posted' then 'notify_other_member'
    when 'expense_draft_confirmed' then 'notify_other_member'
    when 'refund_posted' then 'notify_other_member'
    when 'settlement_recorded' then 'notify_other_member'
    when 'financial_event_corrected' then 'notify_other_member'
    when 'direct_swap_completed' then 'notify_other_member'
    else null
  end;

  if rule_outcome is null then
    raise exception 'unknown activity kind for partner notify: %', p_activity_kind
      using errcode = '22023';
  end if;

  if rule_outcome = 'activity_only' then
    return;
  end if;

  if rule_outcome = 'notify_other_member' then
    other := private.other_household_member(p_household_id, p_actor_member_id);
    perform private.insert_partner_inbox_and_outbox(
      p_household_id,
      other,
      p_actor_member_id,
      p_activity_kind,
      p_entity_type,
      p_entity_id,
      p_payload,
      p_activity_event_id
    );
    return;
  end if;

  foreach recipient in array coalesce(p_affect_member_ids, array[]::uuid[])
  loop
    if recipient is distinct from p_actor_member_id then
      perform private.insert_partner_inbox_and_outbox(
        p_household_id,
        recipient,
        p_actor_member_id,
        p_activity_kind,
        p_entity_type,
        p_entity_id,
        p_payload,
        p_activity_event_id
      );
    end if;
  end loop;
end;
$$;
