// All checks use household-qualified references, including retained correction links.
const dependent = (table) => `select count(*) from public.${table} d where
  not exists(select 1 from public.financial_events e where e.id=d.financial_event_id and e.household_id=d.household_id)
  or not exists(select 1 from public.household_members m where m.user_id=d.member_id and m.household_id=d.household_id)`;
export const financialRelationshipFailures = `(
  (${dependent("ledger_entries")}) + (${dependent("financial_allocations")}) +
  (select count(*) from public.financial_events e where
    not exists(select 1 from public.household_members m where m.user_id=e.created_by_member_id and m.household_id=e.household_id)
    or (e.payer_member_id is not null and not exists(select 1 from public.household_members m where m.user_id=e.payer_member_id and m.household_id=e.household_id))
    or (e.related_event_id is not null and not exists(select 1 from public.financial_events r where r.id=e.related_event_id and r.household_id=e.household_id))
    or (e.category_id is not null and not exists(select 1 from public.expense_categories c where c.id=e.category_id and c.household_id=e.household_id))
    or (e.shopping_session_id is not null and not exists(select 1 from public.shopping_sessions s where s.id=e.shopping_session_id and s.household_id=e.household_id))
    or (e.expense_draft_id is not null and not exists(select 1 from public.expense_drafts d where d.id=e.expense_draft_id and d.household_id=e.household_id)))
)::text`;
