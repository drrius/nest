create function private.nest_require_complete_ledger_event(p_event uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists (
    select 1 from public.financial_events e
    join public.ledger_entries l on l.household_id=e.household_id and l.financial_event_id=e.id
    where e.id=p_event group by e.id
    having count(*)=2 and count(distinct l.member_id)=2
      and sum(l.receivable_delta_cents)=0
  ) then
    raise exception 'Financial event requires a complete two-member zero-sum ledger pair'
      using errcode='23514';
  end if;
end;
$$;

create function private.nest_check_complete_ledger_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='financial_events' then
    perform private.nest_require_complete_ledger_event(new.id);
  else
    perform private.nest_require_complete_ledger_event(new.financial_event_id);
  end if;
  return null;
end;
$$;

revoke all on function private.nest_require_complete_ledger_event(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.nest_check_complete_ledger_event()
  from public,anon,authenticated,service_role;

create constraint trigger nest_financial_event_complete_ledger
  after insert on public.financial_events deferrable initially deferred
  for each row execute function private.nest_check_complete_ledger_event();
create constraint trigger nest_ledger_entry_complete_event
  after insert on public.ledger_entries deferrable initially deferred
  for each row execute function private.nest_check_complete_ledger_event();

-- The migration transaction refuses incomplete retained history rather than repairing it.
select private.nest_require_complete_ledger_event(id) from public.financial_events;
