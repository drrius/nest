create function private.nest_require_financial_allocations(p_event uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_event public.financial_events;
begin
  select * into strict v_event from public.financial_events where id=p_event;
  if v_event.type not in ('expense','refund','replacement') then return; end if;
  if not exists (
    select 1 from public.financial_allocations a
    where a.household_id=v_event.household_id and a.financial_event_id=v_event.id
    group by a.financial_event_id having count(*)=2 and count(distinct a.member_id)=2
      and sum(a.allocated_cents)=v_event.amount_cents
  ) or exists (
    select 1 from public.ledger_entries l left join public.financial_allocations a
      on a.household_id=l.household_id and a.financial_event_id=l.financial_event_id and a.member_id=l.member_id
    where l.household_id=v_event.household_id and l.financial_event_id=v_event.id
      and (a.member_id is null or l.receivable_delta_cents is distinct from
        (case when v_event.type='refund' then -1 else 1 end)*
        (case when l.member_id=v_event.payer_member_id then v_event.amount_cents else 0 end-a.allocated_cents))
  ) then
    raise exception 'Financial allocations do not match the event amount and ledger'
      using errcode='23514';
  end if;
end;
$$;

create function private.nest_check_financial_allocations()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='financial_events' then
    perform private.nest_require_financial_allocations(new.id);
  else
    perform private.nest_require_financial_allocations(new.financial_event_id);
  end if;
  return null;
end;
$$;

revoke all on function private.nest_require_financial_allocations(uuid) from public,anon,authenticated,service_role;
revoke all on function private.nest_check_financial_allocations() from public,anon,authenticated,service_role;

create constraint trigger nest_event_consistent_allocations
  after insert on public.financial_events deferrable initially deferred
  for each row execute function private.nest_check_financial_allocations();
create constraint trigger nest_ledger_consistent_allocations
  after insert on public.ledger_entries deferrable initially deferred
  for each row execute function private.nest_check_financial_allocations();
create constraint trigger nest_allocation_consistent_event
  after insert on public.financial_allocations deferrable initially deferred
  for each row execute function private.nest_check_financial_allocations();

-- Refuse inconsistent retained history without changing its financial records.
select private.nest_require_financial_allocations(id) from public.financial_events;
