create or replace function private.reject_financial_history_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'financial history is append-only'
    using errcode = '55000';
end;
$$;

create trigger financial_events_are_append_only
before update or delete on public.financial_events
for each row
execute function private.reject_financial_history_change();

create trigger financial_allocations_are_append_only
before update or delete on public.financial_allocations
for each row
execute function private.reject_financial_history_change();

create trigger ledger_entries_are_append_only
before update or delete on public.ledger_entries
for each row
execute function private.reject_financial_history_change();

create or replace function private.enforce_ledger_entries_zero_sum()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  unbalanced_event_id uuid;
begin
  select inserted.financial_event_id
  into unbalanced_event_id
  from (
    select distinct financial_event_id
    from inserted_ledger_entries
  ) as inserted
  join public.ledger_entries as entry
    on entry.financial_event_id = inserted.financial_event_id
  group by inserted.financial_event_id
  having sum(entry.receivable_delta_cents) <> 0
  limit 1;

  if unbalanced_event_id is not null then
    raise exception 'ledger entries for event % must sum to zero',
      unbalanced_event_id
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create trigger ledger_entries_enforce_zero_sum
after insert on public.ledger_entries
referencing new table as inserted_ledger_entries
for each statement
execute function private.enforce_ledger_entries_zero_sum();

