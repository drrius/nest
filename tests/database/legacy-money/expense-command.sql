create or replace function public.post_manual_expense(
  p_household_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_payer_member_id uuid,
  p_allocations jsonb,
  p_occurred_on date,
  p_idempotency_key text,
  p_category_id uuid default null,
  p_note text default null,
  p_receipt_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_member_id uuid;
  request_payload jsonb;
  prior_result jsonb;
  result jsonb;
  event_id uuid;
begin
  actor_member_id := private.require_money_actor(p_household_id);
  request_payload := jsonb_build_object(
    'household_id', p_household_id,
    'description', p_description,
    'amount_cents', p_amount_cents,
    'payer_member_id', p_payer_member_id,
    'allocations', p_allocations,
    'occurred_on', p_occurred_on,
    'category_id', p_category_id,
    'note', p_note,
    'receipt_path', p_receipt_path
  );
  prior_result := private.get_money_command_result(
    p_household_id, p_idempotency_key, 'post_manual_expense', request_payload
  );
  if prior_result is not null then
    return prior_result;
  end if;

  event_id := private.post_financial_event(
    p_household_id, actor_member_id, 'expense', p_payer_member_id,
    p_description, p_amount_cents, p_allocations, p_occurred_on,
    null, p_category_id, p_note, p_receipt_path, null, null,
    'expense_posted'
  );
  result := jsonb_build_object('financial_event_id', event_id);
  perform private.store_money_command_result(
    p_household_id, p_idempotency_key, 'post_manual_expense',
    request_payload, result
  );
  return result;
end;
$$;
