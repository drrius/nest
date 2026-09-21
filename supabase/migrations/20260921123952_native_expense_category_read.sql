-- Gated additive read only. Existing household-member RLS remains authoritative.
-- No category mutation, production application or financial write is performed here.
grant select (id, household_id, name, archived_at) on public.expense_categories to authenticated;
