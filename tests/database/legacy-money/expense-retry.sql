create or replace function private.get_money_command_result(
  p_household_id uuid,
  p_idempotency_key text,
  p_command_kind text,
  p_request_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt public.money_command_receipts%rowtype;
begin
  if p_idempotency_key is null
    or length(trim(p_idempotency_key)) not between 1 and 200
  then
    raise exception 'idempotency key must contain 1 to 200 characters'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_household_id::text || ':' || p_idempotency_key, 0)
  );

  select stored_receipt.*
  into receipt
  from public.money_command_receipts as stored_receipt
  where stored_receipt.household_id = p_household_id
    and stored_receipt.idempotency_key = p_idempotency_key;

  if not found then
    return null;
  end if;
  if receipt.command_kind <> p_command_kind
    or receipt.request_payload <> p_request_payload
  then
    raise exception 'idempotency key was already used for a different command'
      using errcode = '22023';
  end if;
  return receipt.result;
end;
$$;

create or replace function private.store_money_command_result(
  p_household_id uuid,
  p_idempotency_key text,
  p_command_kind text,
  p_request_payload jsonb,
  p_result jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.money_command_receipts (
    household_id,
    idempotency_key,
    command_kind,
    request_payload,
    result
  )
  values (
    p_household_id,
    p_idempotency_key,
    p_command_kind,
    p_request_payload,
    p_result
  );
$$;
