create or replace function private.generate_due_recurring_drafts_for_household(
  p_household_id uuid,
  p_actor_member_id uuid,
  p_as_of date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule public.recurring_expense_rules%rowtype;
  due_on date;
  draft_id uuid;
  generated_count integer := 0;
  rule_generated_count integer;
begin
  if p_as_of is null then
    raise exception 'as_of date is required' using errcode = '22023';
  end if;
  if not private.member_belongs_to_household(
    p_household_id,
    p_actor_member_id
  ) then
    raise exception 'recurring draft actor is not a household member'
      using errcode = '42501';
  end if;

  for rule in
    select stored_rule.*
    from public.recurring_expense_rules as stored_rule
    where stored_rule.household_id = p_household_id
      and stored_rule.active
      and stored_rule.next_occurrence_on <= p_as_of
    order by stored_rule.id
    for update
  loop
    due_on := rule.next_occurrence_on;
    rule_generated_count := 0;
    while due_on <= p_as_of loop
      insert into public.expense_drafts (
        household_id,
        source_kind,
        description,
        amount_cents,
        payer_member_id,
        proposed_allocations,
        occurred_on,
        recurring_expense_rule_id,
        category_id
      )
      values (
        rule.household_id,
        'recurring',
        rule.description,
        rule.amount_cents,
        rule.payer_member_id,
        rule.proposed_allocations,
        due_on,
        rule.id,
        rule.category_id
      )
      on conflict (recurring_expense_rule_id, occurred_on)
        where recurring_expense_rule_id is not null
      do nothing
      returning id into draft_id;

      if draft_id is not null then
        generated_count := generated_count + 1;
        rule_generated_count := rule_generated_count + 1;
      end if;
      draft_id := null;
      due_on := private.next_recurring_expense_date(
        rule.schedule_kind,
        due_on,
        rule.iso_weekday,
        rule.day_of_month
      );
    end loop;

    update public.recurring_expense_rules
    set next_occurrence_on = due_on
    where id = rule.id;
    insert into public.activity_events (
      household_id,
      actor_member_id,
      kind,
      entity_type,
      entity_id,
      payload
    )
    values (
      rule.household_id,
      p_actor_member_id,
      'recurring_drafts_generated',
      'recurring_expense_rule',
      rule.id,
      jsonb_build_object(
        'generated_count', rule_generated_count,
        'as_of', p_as_of
      )
    );
  end loop;

  return generated_count;
end;
$$;
