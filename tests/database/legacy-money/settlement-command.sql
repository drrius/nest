drop function if exists public.record_settlement(
  uuid, uuid, bigint, date, text, text, text
);

create function public.record_settlement(
  p_household_id uuid,
  p_payer_member_id uuid,
  p_amount_cents bigint,
  p_occurred_on date,
  p_description text,
  p_idempotency_key text,
  p_note text default null,
  p_mode text default 'partial'
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
  member_id uuid;
  receivable bigint;
  debtor_id uuid;
  outstanding bigint;
  posted_amount bigint;
  debtor_count integer := 0;
  creditor_count integer := 0;
begin
  actor_member_id := private.require_money_actor(p_household_id);
  if p_mode is null or p_mode not in ('full', 'partial') then
    raise exception 'settlement mode must be full or partial'
      using errcode = '22023';
  end if;
  request_payload := jsonb_build_object(
    'household_id', p_household_id,
    'payer_member_id', p_payer_member_id,
    'amount_cents', p_amount_cents,
    'occurred_on', p_occurred_on,
    'description', p_description,
    'note', p_note,
    'mode', p_mode
  );
  prior_result := private.get_money_command_result(
    p_household_id, p_idempotency_key, 'record_settlement',
    request_payload
  );
  if prior_result is not null then
    return prior_result;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ledger:' || p_household_id::text, 0)
  );
  perform 1
  from public.ledger_entries as entry
  where entry.household_id = p_household_id
  for update;

  for member_id, receivable in
    select
      member.user_id,
      coalesce(pg_catalog.sum(entry.receivable_delta_cents), 0)::bigint
    from public.household_members as member
    left join public.ledger_entries as entry
      on entry.household_id = member.household_id
      and entry.member_id = member.user_id
    where member.household_id = p_household_id
    group by member.user_id
  loop
    if receivable < 0 then
      debtor_id := member_id;
      outstanding := pg_catalog.abs(receivable);
      debtor_count := debtor_count + 1;
    elsif receivable > 0 then
      creditor_count := creditor_count + 1;
    end if;
  end loop;

  if debtor_count = 0 then
    raise exception 'The household is already settled up.'
      using errcode = '55000';
  end if;
  if debtor_count <> 1 or creditor_count <> 1 or outstanding is null then
    raise exception 'The household balance could not be reconciled.'
      using errcode = '23514';
  end if;
  if p_payer_member_id is distinct from debtor_id then
    raise exception
      'The named payer does not currently owe the outstanding balance.'
      using errcode = '22023';
  end if;

  if p_mode = 'full' then
    posted_amount := outstanding;
  else
    if p_amount_cents is null
      or p_amount_cents <= 0
      or p_amount_cents > outstanding
    then
      raise exception 'A partial settlement must be within the current balance.'
        using errcode = '22023';
    end if;
    posted_amount := p_amount_cents;
  end if;

  event_id := private.post_financial_event(
    p_household_id, actor_member_id, 'settlement', p_payer_member_id,
    p_description, posted_amount, null, p_occurred_on, null, null,
    p_note, null, null, null, 'settlement_recorded'
  );
  result := jsonb_build_object('financial_event_id', event_id);
  perform private.store_money_command_result(
    p_household_id, p_idempotency_key, 'record_settlement',
    request_payload, result
  );
  return result;
end;
$$;

revoke execute on function public.record_settlement(
  uuid, uuid, bigint, date, text, text, text, text
) from public, anon;
grant execute on function public.record_settlement(
  uuid, uuid, bigint, date, text, text, text, text
) to authenticated;
