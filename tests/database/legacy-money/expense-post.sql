create or replace function private.lock_household_ledger(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ledger:' || p_household_id::text, 0)
  );
end;
$$;

revoke all on function private.lock_household_ledger(uuid)
from public, anon, authenticated;

create or replace function private.post_financial_event(
  p_household_id uuid,
  p_actor_member_id uuid,
  p_type text,
  p_payer_member_id uuid,
  p_description text,
  p_amount_cents bigint,
  p_allocations jsonb,
  p_occurred_on date,
  p_related_event_id uuid,
  p_category_id uuid,
  p_note text,
  p_receipt_path text,
  p_shopping_session_id uuid,
  p_expense_draft_id uuid,
  p_activity_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
  other_member_id uuid;
  payer_allocation bigint;
  other_allocation bigint;
  activity_payload jsonb;
  activity_event_id uuid;
begin
  perform private.lock_household_ledger(p_household_id);
  if p_amount_cents is null
    or p_amount_cents not between 0 and 9007199254740991
  then
    raise exception 'amount_cents must be non-negative safe integer centimes'
      using errcode = '22023';
  end if;
  if p_occurred_on is null then
    raise exception 'occurred_on is required' using errcode = '22023';
  end if;
  if p_description is null
    or length(trim(p_description)) not between 1 and 200
  then
    raise exception 'description must contain 1 to 200 characters'
      using errcode = '22023';
  end if;

  if p_type = 'reversal' then
    if p_payer_member_id is not null or p_related_event_id is null then
      raise exception 'reversal requires only a related event'
        using errcode = '22023';
    end if;
  else
    other_member_id := private.other_household_member(
      p_household_id,
      p_payer_member_id
    );
  end if;

  if p_type in ('expense', 'refund', 'replacement') then
    perform private.validate_money_allocations(
      p_household_id,
      p_amount_cents,
      p_allocations
    );
  elsif p_allocations is not null then
    raise exception '% does not accept allocations', p_type
      using errcode = '22023';
  end if;

  insert into public.financial_events (
    household_id,
    type,
    occurred_on,
    created_by_member_id,
    payer_member_id,
    description,
    amount_cents,
    related_event_id,
    category_id,
    note,
    receipt_path,
    shopping_session_id,
    expense_draft_id
  )
  values (
    p_household_id,
    p_type,
    p_occurred_on,
    p_actor_member_id,
    p_payer_member_id,
    trim(p_description),
    p_amount_cents,
    p_related_event_id,
    p_category_id,
    p_note,
    p_receipt_path,
    p_shopping_session_id,
    p_expense_draft_id
  )
  returning id into event_id;

  if p_type in ('expense', 'refund', 'replacement') then
    insert into public.financial_allocations (
      household_id,
      financial_event_id,
      member_id,
      allocated_cents
    )
    select
      p_household_id,
      event_id,
      item."memberId",
      item."allocatedCents"
    from jsonb_to_recordset(p_allocations)
      as item("memberId" uuid, "allocatedCents" bigint);

    select allocation.allocated_cents
    into payer_allocation
    from public.financial_allocations as allocation
    where allocation.financial_event_id = event_id
      and allocation.member_id = p_payer_member_id;

    select allocation.allocated_cents
    into other_allocation
    from public.financial_allocations as allocation
    where allocation.financial_event_id = event_id
      and allocation.member_id = other_member_id;

    insert into public.ledger_entries (
      household_id,
      financial_event_id,
      member_id,
      receivable_delta_cents
    )
    values
      (
        p_household_id,
        event_id,
        p_payer_member_id,
        case
          when p_type = 'refund'
            then -(p_amount_cents - payer_allocation)
          else p_amount_cents - payer_allocation
        end
      ),
      (
        p_household_id,
        event_id,
        other_member_id,
        case
          when p_type = 'refund' then other_allocation
          else -other_allocation
        end
      );
  elsif p_type in ('opening_balance', 'settlement') then
    insert into public.ledger_entries (
      household_id,
      financial_event_id,
      member_id,
      receivable_delta_cents
    )
    values
      (p_household_id, event_id, p_payer_member_id, p_amount_cents),
      (p_household_id, event_id, other_member_id, -p_amount_cents);
  elsif p_type = 'reversal' then
    insert into public.ledger_entries (
      household_id,
      financial_event_id,
      member_id,
      receivable_delta_cents
    )
    select
      p_household_id,
      event_id,
      entry.member_id,
      -entry.receivable_delta_cents
    from public.ledger_entries as entry
    where entry.household_id = p_household_id
      and entry.financial_event_id = p_related_event_id;

    if (select count(*) from public.ledger_entries where financial_event_id = event_id) <> 2
    then
      raise exception 'related event does not have a complete ledger projection'
        using errcode = '23514';
    end if;
  else
    raise exception 'unknown financial event type %', p_type
      using errcode = '22023';
  end if;

  if p_activity_kind is not null then
    activity_payload := jsonb_build_object('financial_event_type', p_type);
    insert into public.activity_events (
      household_id,
      actor_member_id,
      kind,
      entity_type,
      entity_id,
      payload
    )
    values (
      p_household_id,
      p_actor_member_id,
      p_activity_kind,
      'financial_event',
      event_id,
      activity_payload
    )
    returning id into activity_event_id;
    perform private.deliver_partner_notice(
      p_household_id,
      p_actor_member_id,
      p_activity_kind,
      'financial_event',
      event_id,
      activity_payload,
      activity_event_id
    );
  end if;
  return event_id;
end;
$$;
