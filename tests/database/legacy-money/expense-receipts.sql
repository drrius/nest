create table public.money_command_receipts (
  household_id uuid not null references public.households(id) on delete cascade,
  idempotency_key text not null check (
    length(trim(idempotency_key)) between 1 and 200
  ),
  command_kind text not null check (
    command_kind in (
      'establish_opening_balance',
      'post_manual_expense',
      'confirm_expense_draft',
      'dismiss_expense_draft',
      'post_refund',
      'record_settlement',
      'correct_financial_event',
      'create_recurring_expense_rule',
      'set_recurring_expense_rule_active',
      'generate_due_recurring_drafts'
    )
  ),
  request_payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (household_id, idempotency_key)
);

create trigger money_command_receipts_are_append_only
before update or delete on public.money_command_receipts
for each row
execute function private.reject_financial_history_change();

create policy "members can read money command receipts"
on public.money_command_receipts for select to authenticated
using ((select private.is_household_member(household_id)));
