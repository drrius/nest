create or replace function public.post_refund(
  p_related_event_id uuid,
  p_amount_cents bigint,
  p_allocations jsonb,
  p_occurred_on date,
  p_idempotency_key text,
  p_description text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_member_id uuid;
  related_event public.financial_events%rowtype;
  request_payload jsonb;
  prior_result jsonb;
  result jsonb;
  event_id uuid;
begin
  select stored_event.*
  into related_event
  from public.financial_events as stored_event
  where stored_event.id = p_related_event_id;
  if not found then
    raise exception 'related financial event % does not exist', p_related_event_id
      using errcode = 'P0002';
  end if;
  actor_member_id := private.require_money_actor(related_event.household_id);
  if related_event.type not in ('expense', 'replacement') then
    raise exception 'refunds must relate to an expense or replacement'
      using errcode = '22023';
  end if;

  request_payload := jsonb_build_object(
    'related_event_id', p_related_event_id,
    'amount_cents', p_amount_cents,
    'allocations', p_allocations,
    'occurred_on', p_occurred_on,
    'description', p_description,
    'note', p_note
  );
  prior_result := private.get_money_command_result(
    related_event.household_id, p_idempotency_key, 'post_refund',
    request_payload
  );
  if prior_result is not null then
    return prior_result;
  end if;

  -- All refund and source-correction commands serialize on the source expense.
  perform 1 from public.financial_events where id = related_event.id for update;
  if exists (select 1 from public.financial_events
    where related_event_id = related_event.id and type = 'reversal') then
    raise exception 'This expense has been reversed. Refund its replacement instead.'
      using errcode = '55000';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 9007199254740991 then
    raise exception 'Refund amount must be positive safe integer centimes'
      using errcode = '22023';
  end if;
  perform private.validate_money_allocations(related_event.household_id, p_amount_cents, p_allocations);
  if exists (
    select 1
    from jsonb_to_recordset(p_allocations) as requested("memberId" uuid, "allocatedCents" bigint)
    join public.financial_allocations as original
      on original.financial_event_id = related_event.id and original.member_id = requested."memberId"
    where requested."allocatedCents"::numeric > original.allocated_cents::numeric - coalesce((
      select sum(refunded.allocated_cents::numeric)
      from public.financial_events as refund
      join public.financial_allocations as refunded on refunded.financial_event_id = refund.id
      where refund.related_event_id = related_event.id and refund.type = 'refund'
        and refunded.member_id = original.member_id
        and not exists (select 1 from public.financial_events as reversal
          where reversal.related_event_id = refund.id and reversal.type = 'reversal')
    ), 0)
  ) then
    raise exception 'Refund shares exceed the remaining refundable shares. Refresh this expense.'
      using errcode = '23514';
  end if;

  event_id := private.post_financial_event(
    related_event.household_id, actor_member_id, 'refund',
    related_event.payer_member_id, p_description, p_amount_cents,
    p_allocations, p_occurred_on, related_event.id, related_event.category_id,
    p_note, null, null, null, 'refund_posted'
  );
  result := jsonb_build_object('financial_event_id', event_id);
  perform private.store_money_command_result(
    related_event.household_id, p_idempotency_key, 'post_refund',
    request_payload, result
  );
  return result;
end;
$$;
