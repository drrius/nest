-- Preserve one starting-balance lineage while allowing immutable corrections.
-- The original anonymous CHECK follows the payer CHECK in the initial schema.
alter table public.financial_events drop constraint financial_events_check1;
alter table public.financial_events add constraint financial_events_related_event_check check (
  (type in ('refund', 'reversal', 'replacement') and related_event_id is not null)
  or (type in ('expense', 'settlement') and related_event_id is null)
  or type = 'opening_balance'
);
drop index public.financial_events_one_opening_balance_idx;
create unique index financial_events_one_opening_balance_idx
  on public.financial_events (household_id)
  where type = 'opening_balance' and related_event_id is null;
create unique index financial_events_one_opening_successor_idx
  on public.financial_events (related_event_id)
  where type = 'opening_balance' and related_event_id is not null;

create or replace function private.validate_opening_balance_lineage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'opening_balance' and new.related_event_id is not null then
    if not exists (
      select 1 from public.financial_events as parent
      where parent.id = new.related_event_id and parent.household_id = new.household_id
        and parent.type = 'opening_balance'
    ) or not exists (
      select 1 from public.financial_events as reversal
      where reversal.related_event_id = new.related_event_id
        and reversal.household_id = new.household_id and reversal.type = 'reversal'
    ) then
      raise exception 'opening corrections require a reversed opening balance parent'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_opening_balance_lineage() from public, anon, authenticated;
create trigger financial_events_opening_lineage
before insert on public.financial_events
for each row execute function private.validate_opening_balance_lineage();
