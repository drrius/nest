# Correction and refund transaction audit

Reference: Household OS commit `4a528c96caf41515a70291ccecbba9d7b35e3349`. The final `public.post_refund`, `public.correct_financial_event` and opening-lineage constraints/trigger come from `supabase/migrations/20260904230229_money_refund_limits_and_recurring_edit.sql`. These supersede the August correction/refund versions. Complete selected statements are pinned unchanged in `tests/database/legacy-money/`, with hashes in its provenance manifest. No production data or connection was used.

The fixture runs these commands against the already audited final expense/ledger engine and actual activity/partner-notice/outbox helpers. It does not substitute a success-only notification function. The fixture grants only authenticated public command execution and keeps private posting helpers inaccessible to ordinary callers.

Refunds require an expense or replacement, a positive safe-centime amount, and two allocations whose sum equals that amount. Each requested share is capped by its original allocation minus active, unreversed refund shares. The original payer receives the refund. Refunding a reversed source is rejected. Reversing a refund restores its allowance; correcting its source while an active refund exists is rejected. Concurrent refund/source-correction requests serialize on the original event. Refund reversal locks the parent before the refund itself.

Corrections retain the original, append its opposite ledger projection, and optionally append a linked replacement. Reversals cannot themselves be corrected. One transaction includes the reversal, replacement, activity, real notice and command receipt. A failed notice rolls everything back. Opening corrections preserve a single root and successor lineage, including repair of a reversed leaf, rather than resetting the original starting balance or allowing another root.

## Native reuse requirements

Reuse the audited engine behind strict native commands, with actor/household/operation-bound immutable receipts and authorization before replay. The legacy receipt key remains household-wide: the partner can replay an identical command key, as the audit test demonstrates. Never use it directly as the native operation identity.

A native command must validate its complete payload, preserve current membership for posting, bind the intended source and reviewed financial effect, and atomically consume the exact AI approval only when posting succeeds. Refund remaining-share reads must be authorized and current; source correction/refund races must fail clearly and require reconciliation. Preserve the existing parent/target locking order when adding ledger and approval locks, including compatibility with old writers before cutover. Do not introduce an opposite row/ledger lock order.

Grocery totals and receipt references need explicit preservation rules for replacement entries; retaining an original entry does not by itself populate a replacement's metadata. Direct Save and private AI proposals require native exact-review UI, durable uncertain-outcome recovery and explicit cancellation/retry behavior. This audit does not implement those workflows.

## Read compatibility correction

Nest's history contract previously required every opening balance to have no parent. That rejected valid retained September-era opening corrections, causing both history and detail reads to fail validation. The shared contract now permits opening successors with a parent, while retaining required parents for refunds/reversals/replacements, forbidding parents for ordinary expenses/settlements, and rejecting self-links. An actual corrected opening fixture reads through authorized balance, history, detail and AI adapters with three retained events and the corrected exact balance. No new financial writer is exposed by this contract fix.

## Verification

Six PostgreSQL cases cover concurrent identical correction replay, distinct competing refunds, 12 refund/correction races, per-member limits, refund reversal, source restrictions, foreign/anonymous denial, real notice-failure rollback, immutable original events and ledger entries, 32 generated refund/reversal sequences through the safe-centime endpoint, and opening-lineage repair/fork prevention. Two API boundary cases and one real API/PostgREST/AI journey validate corrected opening reads without weakening unrelated-event checks. This is audit/read compatibility evidence, not an implemented correction/refund form, approved native writer, migration rehearsal or physical-device verification.
