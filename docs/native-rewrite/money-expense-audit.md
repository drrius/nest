# Expense transaction audit

Reference: Household OS commit `4a528c96caf41515a70291ccecbba9d7b35e3349`. Only source and disposable synthetic data were inspected. These fixtures do not install a production writer or make native expense entry complete.

## Selected actual engine

The unchanged `public.post_manual_expense` wrapper and its authorization, allocation validation and idempotency helpers come from `20260811200000_chf_ledger.sql`. The **final** `private.post_financial_event` implementation comes from `20260812202316_share_ledger_lock.sql`, superseding both the initial ledger and intermediate notification implementation. It takes the shared household ledger lock before appending the event, two allocations and two zero-sum ledger entries. It then appends activity and invokes actual partner-notice delivery in the same transaction. The command receipt is stored last; any failure rolls everything back.

`tests/database/legacy-money/provenance.json` records the pinned source and hashes for each complete excerpt. Activity table definitions and the money-specific constraint extension are retained. The already audited notification tables/helpers/final dispatcher from the routine-edit fixture are reused; see [routine edit audit](routine-edit-audit.md). No success-only notification stub is present. Fixture permissions retain member-only invocation, private-helper denial, receipt RLS and immutable receipts. Shopping/draft FK interfaces remain inert: this audit exercises neither workflow nor receipt storage.

## Reuse decision and required native protections

Reuse the actual expense transaction behind a new authorized Nest wrapper rather than rebuilding its ledger and notification side effects. Keep all history and the common ledger lock. Do not copy the cookie-bound legacy application adapter or expose arbitrary RPC names to AI.

The legacy receipt key is household-wide, and its payload omits the actor. A second member submitting the same key and payload receives the original member's receipt. This is demonstrated in a database test; it must not become the native retry identity. The Nest wrapper must bind actor, household, operation and exact canonical payload, authorize before replay, and generate an unpredictable internal legacy key. Check the native receipt before invoking the engine so committed retries do not reapply. An amount, payer or allocation change requires a fresh operation and fresh AI approval.

The native boundary must validate all input fields strictly, reject unsupported fields, resolve both current members and retain their membership through the transaction. The legacy helper's JSON null comparisons are not sufficient input validation on their own; table constraints reject tested incomplete allocations, but explicit validation is still required. Keep centimes exact and return strings at the transport boundary. Zero-cent expenses are accepted by the retained engine and existing pure domain; no new prohibition is inferred from the brief.

Ordinary native Save authorizes an expense without a partner signature. AI may propose an exact expense, but execution must consume the existing member/invocation/payload-bound server approval in the **same transaction** as the expense and native receipt. The model must not select a UI-origin bypass. A committed receipt must replay even after the consumed approval expires; an uncommitted expired or altered approval must never post. These native and AI boundaries remain to be implemented and verified.

Receipt upload/access, category selection, grocery total/shared-amount metadata, settlements, corrections/refunds and recurring mandates remain separate unfinished work. A legacy receipt-path argument does not prove safe storage access. Existing legacy notification delivery is preserved for compatibility; this fixture does not prove APNs delivery or the final recipient-preference behavior required by M8.

## Local verification

Six actual PostgreSQL cases cover eight concurrent retries producing one complete expense/notice, foreign/anonymous/direct-helper denial, malformed allocations and invalid payer rollback, immutable receipts, full rollback after forced outbox failure with successful same-key retry, the cross-member legacy-key limitation, and synchronization on the shared ledger lock. One hundred sixty generated exact/equal/percentage allocation inputs include zero, odd centimes, both payers and the safe-integer endpoint. Stored allocations and payer deltas are checked against the original totals, with two complete zero-sum entries for every event. This is engine evidence, not native UI, real AI approval, live push or device evidence.
