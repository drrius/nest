create or replace function public.set_recurring_expense_rule_active(
  p_rule_id uuid,
  p_active boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_member_id uuid;
  rule public.recurring_expense_rules%rowtype;
  request_payload jsonb;
  prior_result jsonb;
  result jsonb;
begin
  select stored_rule.*
  into rule
  from public.recurring_expense_rules as stored_rule
  where stored_rule.id = p_rule_id;
  if not found then
    raise exception 'recurring expense rule % does not exist', p_rule_id
      using errcode = 'P0002';
  end if;
  actor_member_id := private.require_money_actor(rule.household_id);
  if p_active is null then
    raise exception 'active state is required' using errcode = '22023';
  end if;
  request_payload := jsonb_build_object('rule_id', p_rule_id, 'active', p_active);
  prior_result := private.get_money_command_result(
    rule.household_id, p_idempotency_key, 'set_recurring_expense_rule_active',
    request_payload
  );
  if prior_result is not null then
    return prior_result;
  end if;

  update public.recurring_expense_rules
  set active = p_active
  where id = rule.id;
  insert into public.activity_events (
    household_id, actor_member_id, kind, entity_type, entity_id, payload
  )
  values (
    rule.household_id, actor_member_id, 'recurring_expense_rule_updated',
    'recurring_expense_rule', rule.id, jsonb_build_object('active', p_active)
  );
  result := jsonb_build_object(
    'recurring_expense_rule_id', rule.id,
    'active', p_active
  );
  perform private.store_money_command_result(
    rule.household_id, p_idempotency_key, 'set_recurring_expense_rule_active',
    request_payload, result
  );
  return result;
end;
$$;
