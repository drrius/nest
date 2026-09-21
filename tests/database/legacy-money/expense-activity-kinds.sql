alter table public.activity_events
  drop constraint activity_events_kind_check;

alter table public.activity_events
  add constraint activity_events_kind_check check (
    kind in (
      'routine_created',
      'routine_updated',
      'occurrence_completed',
      'occurrence_skipped',
      'occurrence_rescheduled',
      'routine_paused',
      'routine_unpaused',
      'routine_archived',
      'meal_plan_entry_created',
      'meal_plan_entry_updated',
      'meal_plan_entry_removed',
      'shopping_session_finished',
      'opening_balance_established',
      'expense_posted',
      'expense_draft_confirmed',
      'expense_draft_dismissed',
      'refund_posted',
      'settlement_recorded',
      'financial_event_corrected',
      'recurring_expense_rule_created',
      'recurring_expense_rule_updated',
      'recurring_drafts_generated'
    )
  );

alter table public.activity_events
  drop constraint activity_events_entity_type_check;

alter table public.activity_events
  add constraint activity_events_entity_type_check check (
    entity_type in (
      'routine',
      'routine_occurrence',
      'meal_plan_entry',
      'shopping_session',
      'financial_event',
      'expense_draft',
      'recurring_expense_rule',
      'expense_category'
    )
  );
