create or replace function public.correct_financial_event(
  p_event_id uuid,
  p_idempotency_key text,
  p_replacement jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_member_id uuid;
  target public.financial_events%rowtype;
  request_payload jsonb;
  prior_result jsonb;
  result jsonb;
  reversal_event_id uuid;
  replacement_event_id uuid;
  activity_payload jsonb;
  activity_event_id uuid;
begin
  select stored_event.*
  into target
  from public.financial_events as stored_event
  where stored_event.id = p_event_id;
  if not found then
    raise exception 'financial event % does not exist', p_event_id
      using errcode = 'P0002';
  end if;
  actor_member_id := private.require_money_actor(target.household_id);
  request_payload := jsonb_build_object(
    'event_id', p_event_id,
    'replacement', p_replacement
  );
  prior_result := private.get_money_command_result(
    target.household_id, p_idempotency_key, 'correct_financial_event',
    request_payload
  );
  if prior_result is not null then
    return prior_result;
  end if;

  -- Lock the parent first when reversing a refund: the same ordering as post_refund.
  if target.type = 'refund' then
    perform 1 from public.financial_events where id = target.related_event_id for update;
  end if;
  select stored_event.*
  into target
  from public.financial_events as stored_event
  where stored_event.id = p_event_id
  for update;
  if target.type = 'reversal' then
    raise exception 'reversal events cannot be corrected'
      using errcode = '22023';
  end if;
  select child.id into reversal_event_id
  from public.financial_events as child
  where child.related_event_id = target.id and child.type = 'reversal';
  -- A reversed opening leaf may be repaired, but no ancestor can fork the lineage.
  if (reversal_event_id is not null and not (
      target.type = 'opening_balance' and p_replacement is not null
    )) or exists (
      select 1 from public.financial_events as child
      where child.related_event_id = target.id and child.type = 'opening_balance'
    ) then
    raise exception 'financial event has already been corrected'
      using errcode = '55000';
  end if;
  if p_replacement is not null
    and jsonb_typeof(p_replacement) <> 'object'
  then
    raise exception 'replacement must be a JSON object'
      using errcode = '22023';
  end if;
  if p_replacement is not null
    and target.type not in ('expense', 'replacement', 'opening_balance')
  then
    raise exception
      'replacement corrections are only supported for expense or opening balance events'
      using errcode = '22023';
  end if;

  if target.type = 'opening_balance' and p_replacement is not null
    and p_replacement -> 'allocations' <> 'null'::jsonb then
    raise exception 'opening balance corrections do not accept expense allocations'
      using errcode = '22023';
  end if;

  if target.type in ('expense', 'replacement') and exists (
    select 1 from public.financial_events as refund
    where refund.related_event_id = target.id and refund.type = 'refund'
      and not exists (select 1 from public.financial_events as reversal
        where reversal.related_event_id = refund.id and reversal.type = 'reversal')
  ) then
    raise exception 'Reverse the active refunds before correcting this expense.'
      using errcode = '55000';
  end if;

  if reversal_event_id is null then
    reversal_event_id := private.post_financial_event(
    target.household_id, actor_member_id, 'reversal', null,
    'Reversal: ' || target.description, target.amount_cents, null,
    target.occurred_on, target.id, null, null, null, null, null, null
    );
  end if;

  if p_replacement is not null and target.type = 'opening_balance' then
    -- Opening balances store the creditor, never expense allocations or receipts.
    replacement_event_id := private.post_financial_event(
      target.household_id, actor_member_id, 'opening_balance',
      (p_replacement ->> 'payer_member_id')::uuid,
      p_replacement ->> 'description',
      (p_replacement ->> 'amount_cents')::bigint, null,
      (p_replacement ->> 'occurred_on')::date, target.id,
      null, p_replacement ->> 'note', null, null, null, null
    );
  elsif p_replacement is not null then
    replacement_event_id := private.post_financial_event(
      target.household_id, actor_member_id, 'replacement',
      (p_replacement ->> 'payer_member_id')::uuid,
      p_replacement ->> 'description',
      (p_replacement ->> 'amount_cents')::bigint,
      p_replacement -> 'allocations',
      (p_replacement ->> 'occurred_on')::date,
      target.id,
      (p_replacement ->> 'category_id')::uuid,
      p_replacement ->> 'note',
      p_replacement ->> 'receipt_path',
      null, null, null
    );
  end if;

  activity_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'reversal_event_id', reversal_event_id,
      'replacement_event_id', replacement_event_id
    )
  );
  insert into public.activity_events (
    household_id, actor_member_id, kind, entity_type, entity_id, payload
  )
  values (
    target.household_id, actor_member_id, 'financial_event_corrected',
    'financial_event', target.id, activity_payload
  )
  returning id into activity_event_id;
  perform private.deliver_partner_notice(
    target.household_id,
    actor_member_id,
    'financial_event_corrected',
    'financial_event',
    target.id,
    activity_payload,
    activity_event_id
  );
  result := jsonb_strip_nulls(
    jsonb_build_object(
      'corrected_financial_event_id', target.id,
      'reversal_event_id', reversal_event_id,
      'replacement_event_id', replacement_event_id
    )
  );
  perform private.store_money_command_result(
    target.household_id, p_idempotency_key, 'correct_financial_event',
    request_payload, result
  );
  return result;
end;
$$;
