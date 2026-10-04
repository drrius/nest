begin;
do $fixture$
declare
  v_household uuid := 'be772ffd-3ab5-41d5-8438-647a79a553da';
  v_members uuid[];
  v_before jsonb;
  v_after jsonb;
begin
  select array_agg(user_id order by user_id) into v_members
    from public.household_members where household_id=v_household;
  if v_members is distinct from array['791f7261-6c9d-4061-9c8a-57aa6e0b0200'::uuid,'e5f80cfd-b69a-4aa0-a267-75784e943676'::uuid] then
    raise exception 'Not the exact fictional two-member test household';
  end if;
  if exists(select 1 from public.recurring_expense_rules where household_id=v_household)
    or exists(select 1 from public.expense_drafts where household_id=v_household) then
    raise exception 'Inspect existing retained data instead of repeating fixture creation';
  end if;
  select jsonb_build_object(
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e where household_id=v_household),
    'allocations',(select jsonb_agg(to_jsonb(a) order by financial_event_id,member_id) from public.financial_allocations a where household_id=v_household),
    'ledger',(select jsonb_agg(to_jsonb(l) order by financial_event_id,member_id) from public.ledger_entries l where household_id=v_household)
  ) into v_before;
  insert into public.recurring_expense_rules(
    id,household_id,description,amount_cents,payer_member_id,proposed_allocations,
    schedule_kind,iso_weekday,active,next_occurrence_on)
  values('8102650a-db30-441e-b693-4f5b9561116f',v_household,'Synthetic retained recurring rule',101,'791f7261-6c9d-4061-9c8a-57aa6e0b0200',
    '[{"memberId":"791f7261-6c9d-4061-9c8a-57aa6e0b0200","allocatedCents":51},{"memberId":"e5f80cfd-b69a-4aa0-a267-75784e943676","allocatedCents":50}]',
    'weekly',1,false,'2030-01-07');
  insert into public.expense_drafts(
    id,household_id,source_kind,recurring_expense_rule_id,description,amount_cents,
    payer_member_id,proposed_allocations,occurred_on)
  values('93d9639d-ff5d-4c58-8e53-47e405e91199',v_household,'recurring','8102650a-db30-441e-b693-4f5b9561116f','Synthetic retained confirmation draft',101,
    '791f7261-6c9d-4061-9c8a-57aa6e0b0200','[{"memberId":"791f7261-6c9d-4061-9c8a-57aa6e0b0200","allocatedCents":51},{"memberId":"e5f80cfd-b69a-4aa0-a267-75784e943676","allocatedCents":50}]','2026-09-21'),
    ('cc96fb8e-e5d1-455e-a199-4e60f9ec24a8',v_household,'recurring','8102650a-db30-441e-b693-4f5b9561116f','Synthetic retained dismissal draft',101,
    '791f7261-6c9d-4061-9c8a-57aa6e0b0200','[{"memberId":"791f7261-6c9d-4061-9c8a-57aa6e0b0200","allocatedCents":51},{"memberId":"e5f80cfd-b69a-4aa0-a267-75784e943676","allocatedCents":50}]','2026-09-28');
  if (select count(*) from public.recurring_expense_rules where household_id=v_household and not active) <> 1
    or (select count(*) from public.expense_drafts where household_id=v_household and status='pending') <> 2 then
    raise exception 'Fixture is not exactly one inactive rule and two pending drafts';
  end if;
  select jsonb_build_object(
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e where household_id=v_household),
    'allocations',(select jsonb_agg(to_jsonb(a) order by financial_event_id,member_id) from public.financial_allocations a where household_id=v_household),
    'ledger',(select jsonb_agg(to_jsonb(l) order by financial_event_id,member_id) from public.ledger_entries l where household_id=v_household)
  ) into v_after;
  if v_before is distinct from v_after then raise exception 'Fixture altered financial history'; end if;
end;
$fixture$;
rollback;
select jsonb_build_object('rules',(select count(*) from public.recurring_expense_rules where household_id='be772ffd-3ab5-41d5-8438-647a79a553da'),
  'drafts',(select count(*) from public.expense_drafts where household_id='be772ffd-3ab5-41d5-8438-647a79a553da')) as after_rollback;
