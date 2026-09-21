alter table public.expense_categories enable row level security;

create policy "members can read expense categories"
on public.expense_categories for select to authenticated
using ((select private.is_household_member(household_id)));

revoke all on table public.expense_categories from anon, authenticated;

alter table public.financial_events enable row level security;

create policy "members can read financial events"
on public.financial_events for select to authenticated
using ((select private.is_household_member(household_id)));

revoke all on table public.financial_events from anon, authenticated;

grant select on table public.financial_events to authenticated;

alter table public.financial_allocations enable row level security;

create policy "members can read financial allocations"
on public.financial_allocations for select to authenticated
using ((select private.is_household_member(household_id)));

revoke all on table public.financial_allocations from anon, authenticated;

grant select on table public.financial_allocations to authenticated;

alter table public.ledger_entries enable row level security;

create policy "members can read ledger entries"
on public.ledger_entries for select to authenticated
using ((select private.is_household_member(household_id)));

revoke all on table public.ledger_entries from anon, authenticated;

grant select on table public.ledger_entries to authenticated;
