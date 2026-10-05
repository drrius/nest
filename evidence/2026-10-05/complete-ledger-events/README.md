# Complete ledger events — 5 October 2026

The retained statement-level zero-sum trigger permits an event without ledger
entries and an event with one zero entry. Native reads and reconciliation reject
these states, but a trusted writer could still commit them. The additive migration
adds deferred constraints to financial-event and ledger-entry inserts: every event
must have exactly two distinct, household-qualified member entries summing to zero
at transaction completion. Existing immediate zero-sum and append-only guards stay.

The migration validates all retained events and refuses incomplete history rather
than changing, deleting or inventing financial rows. Trigger installation and
revalidation run in the migration transaction. Both internal functions use empty
search paths and have no client or service EXECUTE grant; triggers invoke them.
The guard creates no public RPC or new authorization path.

## Local verification

Eight real PostgreSQL tests pass without failures/skips:

- Reproduce both retained defects; failed migration rolls back functions/triggers
  and leaves malformed history intact.
- Commit-time refusal of missing/single entries rolls back the transaction; valid
  zero entries may be assembled in separate statements before commit.
- 259 deterministic signed pairs, including zero and both safe-integer endpoints.
- Tenant foreign keys, duplicates, immediate imbalance and immutable history.
- Denied private execution/direct member writes; a trusted service also cannot
  commit an incomplete pair.
- Six concurrent real native-command exact retries converge on one event/two
  entries; both-member reads and outsider refusals hold.
- Missing/pending/changed AI approvals still cannot post money; valid confirmation
  creates one complete pair.

The complete309-migration disposable rehearsal passes, preserving all seven
financial events, eight allocations, fourteen entries and one receipt reference,
including the cutover/recovery checks. Four exact-source manifest tests pass.
Scoped Oxlint passes with existing Effect advice warnings; source limits pass.
The first test-only SQL concatenation omitted a semicolon; it was corrected before
these passing results. No shipping financial command needed alteration.

Auth/Storage infrastructure is simulated and pg_net explicitly excluded in the
local chain. Supabase advisors are not configured locally. This does not certify
provider/native phone execution, every financial rule or production cutover.

## Hosted status

Fresh nest-test preflight sees61 events, zero invalid pairs and unchanged complete
financial/activity/Storage fingerprints. The first automatic approval review was
at capacity and executed no query; a later ordinary read-only retry succeeded.
Deployment/postflight and required source CI are pending. Production is untouched.
