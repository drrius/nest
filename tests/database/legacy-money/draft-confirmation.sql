create or replace function public.confirm_expense_draft(
  p_draft_id uuid,
  p_idempotency_key text,
  p_amount_cents bigint default null,
  p_payer_member_id uuid default null,
  p_allocations jsonb default null,
  p_occurred_on date default null,
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
  draft public.expense_drafts%rowtype;
  request_payload jsonb;
  prior_result jsonb;
  result jsonb;
  event_id uuid;
  activity_payload jsonb;
  activity_event_id uuid;
begin
  select stored_draft.*
  into draft
  from public.expense_drafts as stored_draft
  where stored_draft.id = p_draft_id;
  if not found then
    raise exception 'expense draft % does not exist', p_draft_id
      using errcode = 'P0002';
  end if;
  actor_member_id := private.require_money_actor(draft.household_id);
  request_payload := jsonb_build_object(
    'draft_id', p_draft_id,
    'amount_cents', p_amount_cents,
    'payer_member_id', p_payer_member_id,
    'allocations', p_allocations,
    'occurred_on', p_occurred_on,
    'category_id', p_category_id,
    'note', p_note,
    'receipt_path', p_receipt_path
  );
  prior_result := private.get_money_command_result(
    draft.household_id, p_idempotency_key, 'confirm_expense_draft',
    request_payload
  );
  if prior_result is not null then
    return prior_result;
  end if;

  select stored_draft.*
  into draft
  from public.expense_drafts as stored_draft
  where stored_draft.id = p_draft_id
  for update;
  if draft.status <> 'pending' then
    raise exception 'only pending expense drafts can be confirmed'
      using errcode = '55000';
  end if;

  event_id := private.post_financial_event(
    draft.household_id, actor_member_id, 'expense',
    coalesce(p_payer_member_id, draft.payer_member_id),
    draft.description, coalesce(p_amount_cents, draft.amount_cents),
    coalesce(p_allocations, draft.proposed_allocations),
    coalesce(p_occurred_on, draft.occurred_on), null,
    coalesce(p_category_id, draft.category_id),
    p_note, p_receipt_path, draft.shopping_session_id, draft.id, null
  );
  update public.expense_drafts
  set status = 'posted'
  where id = draft.id;

  activity_payload := jsonb_build_object('financial_event_id', event_id);
  insert into public.activity_events (
    household_id, actor_member_id, kind, entity_type, entity_id, payload
  )
  values (
    draft.household_id, actor_member_id, 'expense_draft_confirmed',
    'expense_draft', draft.id, activity_payload
  )
  returning id into activity_event_id;
  perform private.deliver_partner_notice(
    draft.household_id,
    actor_member_id,
    'expense_draft_confirmed',
    'expense_draft',
    draft.id,
    activity_payload,
    activity_event_id
  );
  result := jsonb_build_object(
    'expense_draft_id', draft.id,
    'financial_event_id', event_id
  );
  perform private.store_money_command_result(
    draft.household_id, p_idempotency_key, 'confirm_expense_draft',
    request_payload, result
  );
  return result;
end;
$$;
