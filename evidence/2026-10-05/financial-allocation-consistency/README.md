# Financial allocation consistency — 5 October 2026

A disposable PostgreSQL reproduction proves that an expense can commit with a
complete balanced ledger but no allocations, or allocations inconsistent with
its ledger. Native entry validation already rejects those states. The new
additive constraint applies to expenses, replacements and refunds: exactly two
distinct household-qualified allocations must total the event amount, and each
member's ledger delta must match their allocation and the payer/refund direction.

The event, ledger and allocation insert triggers are deferred until transaction
completion. Existing zero-sum, pair-cardinality, append-only and authorization
guards remain. Both private trigger helpers use empty search paths and have no
client or service EXECUTE grant. No public RPC, API command or client is added.
Migration revalidation refuses inconsistent history without repairing/deleting it.

## Verification

Eight real PostgreSQL tests pass, zero failures/skips. They reproduce both retained
defects and atomic migration refusal; reject missing/partial/wrong-total/wrong-sign
new states; permit separate valid statements within one transaction; check792
allocation-arithmetic combinations across both payers and all three event kinds,
including zero and the safe-integer boundary; deny client helper/direct writes;
constrain trusted service writes; converge six actual native-command SQL retries;
and preserve missing/pending/changed AI-approval refusals with valid posting.
The initial test-only helper argument mistakes were corrected before these results.

The complete310-migration disposable rehearsal passes. Both reconciliation and
cutover preserve all seven events, eight allocations, fourteen ledger entries and
one receipt reference. Four exact-checksum manifest tests and scoped lint,
formatting/source limits pass. See [verification](verification.json).

Auth/Storage infrastructure is simulated, pg_net explicitly excluded and local
Supabase advisors unconfigured. Arithmetic cases prove this allocation boundary,
not every refund/correction relationship or external-writer rule. SQL native-command
compatibility is not SwiftUI/device execution or successful live model inference.

## Hosted status

Nest-test preflight finds62 events, including52 allocation-bearing events, all
consistent with the proposed rule. Six full financial/activity/Storage fingerprints
are captured before deployment. Deployment and postflight remain pending.
Production is untouched. No hosted financial write, new native run, beta, purchase,
model call, worker activation or source merge occurred for this database change.
