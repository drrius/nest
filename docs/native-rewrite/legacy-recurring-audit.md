# Legacy recurring preservation and adoption

The approved scope requires retaining legacy rules and drafts without silently granting Nest automatic posting. The initial implementation is a read-only inventory, not a completed migration or adoption flow.

## Audited facts

Reference: Household OS revision `4a528c96caf41515a70291ccecbba9d7b35e3349`. The table definitions, draft generation, confirmation links and later versioned edit function were inspected; no production data or credentials were accessed. The deliberately scoped fixture provenance is in `tests/database/legacy-recurring/README.md`.

Legacy rules retain IDs, household, active flag, description, exact amount and proposed allocations, payer/category, weekly/monthly cadence, next occurrence and the microsecond `updated_at` edit version. Active means the old draft generator is enabled. It does not authorize Nest automatic posting. Generating drafts also changes the edit version, so an eventual adoption command must compare fresh state under the legacy row lock.

Drafts retain their own description, amount, split, occurrence, status and rule reference even after the rule changes. A posted draft links to the immutable financial event through `financial_events.expense_draft_id`. Pending and dismissed drafts are not new Nest cycle receipts. Migrating must not auto-match them by description or count them as new expenses.

## Implemented inventory

`nest_read_legacy_recurring` returns up to 20 household-authorized rules in ID order with stable continuation. Every row is explicitly `legacy_draft_only`. It preserves the exact edit version, converts safe integer centimes to strings without rounding, and returns pending/posted/dismissed counts and latest retained draft date. It separately counts posted drafts lacking an event and unposted drafts with an event. Nonzero discrepancy counts require reconciliation; the read does not correct them.

The finite API, native/session transport and AI read tool use strict contracts and bind household/cursor. No rule, draft, ledger, native mandate or scheduling cursor is changed. The inventory does not prove full financial reconciliation: it does not compare every allocation, balance, receipt object or historical financial relationship. That remains part of M9's complete rehearsal.

## Remaining adoption gates

Native legacy list and draft-detail review remain to implement. Explicit adoption must retain legacy-to-native identity, require the exact reviewed legacy version and selected future terms, serialize with old rule edits/generation, and prevent duplicate posting for retained draft periods. Pending legacy obligations need a visible reconciliation/decision path. Neither old active status nor the AI reading this inventory grants consent. Native rules must not be created as unlinked copies to bypass this reconciliation.

A safe command must preserve old drafts/history, stop incompatible legacy generation only through a reviewed transition, and retain an immutable adoption result for lost-response recovery. Corresponding private AI proposals require the same explicit native approval. Legacy clients and scheduled generators must be fenced before production cutover; hiding old UI is insufficient. All implementation and rehearsal can proceed with synthetic fixtures, but production migration, old-app retirement and hosted scheduler activation remain separately gated.
