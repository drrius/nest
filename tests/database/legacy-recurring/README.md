# Audited legacy recurring fixture

Source repository: `/home/drrius/Work/household-os`, revision `4a528c96caf41515a70291ccecbba9d7b35e3349` at audit. No production connection or rows were read.

- `rules.sql` deliberately copies the recurring-rule table definition from `20260811200000_chf_ledger.sql`. Only fixture RLS enabling is appended. It does not copy generators, cron registration or infrastructure defaults.
- `draft-columns.sql` expands the Nest ledger fixture's existing FK-only draft table to the columns and constraints needed for inventory. These are based on the draft table in `20260811180000_meals_groceries.sql` and recurring/category additions in `20260811200000_chf_ledger.sql`. Fixture-only defaults allow synthetic inserts; this is not a production migration or a full legacy behavior simulator.
- Legacy allocations use JSON numeric `allocatedCents`. The read bridge emits exact decimal strings and canonical UUIDs without changing retained JSON.
- The audited September edit-version migration (`20260905002500_recurring_expense_edit_versions.sql`) advances `updated_at` monotonically with microsecond precision on every rule mutation, including generation and pause/resume. Inventory retains that version exactly; it is not an automatic-posting authorization.
- `20260812090000_notifications_realtime.sql` generates `expense_drafts` and advances the legacy cursor. It does not post financial events. Legacy draft confirmation links `financial_events.expense_draft_id`; edits preserve existing draft bodies. Pending/posted/dismissed records remain separate from Nest cycle receipts.

The tests post synthetic financial events using the already audited real legacy posting function. They compare retained rules, drafts, events, ledger entries, native rules and cursors before/after reads. Inconsistent status/link fixtures intentionally model reconciliation blockers; the reader exposes counts and performs no repair.
