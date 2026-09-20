# Routine creation storage audit

This additive candidate implements a real create transaction against existing routine tables. It is not production-applied or a completed native routine-management flow.

## Source and scope

Legacy reference commit: `4a528c96caf41515a70291ccecbba9d7b35e3349`. The disposable fixture deliberately selects table definitions from `20260809210000_routine_engine.sql`, schedule validation/date functions from `20260830210000_biweekly_schedule.sql`, and the latest occurrence insertion function from `20260830220000_preserve_reschedule_on_rebuild.sql`. Assignment and reminder-candidate helpers are copied from the original routine migration. Files under `tests/database/legacy-routines` are test resources, not production migrations. Existing audited tenancy supplies real constraints and RLS helpers; only Supabase-owned auth infrastructure is simulated.

The new command uses the existing date and occurrence-insertion functions. It creates the first current/preview pair directly because a brand-new routine has no history to rebuild. It does not replace the legacy rebuild, closure or definition-edit functions, and this fixture does not claim to rehearse those functions. One-off routines have only a current occurrence; shared work remains unassigned. No reminder preference is inserted, so the existing insertion helper creates no delivery candidates for new work.

General is a compatibility foreign-key reference, not an exposed feature. Missing General is inserted transactionally under the household creation lock. An existing reference is reused without altering its archive status or historical routines. Native creation does not depend on legacy area visibility. Instructions, pets, priority selection and active windows are not added to the native form; old rows and columns are preserved.

## Authorization and retries

The private security-definer command authenticates and locks the caller's current membership before receipt lookup, then serializes household creation and holds both membership rows while creating. New creation requires exactly two members; assigned/alternating members must belong to that household. Public wrappers are security invoker, internal helper execution is revoked and receipts expose only the current actor's household-bound records. Existing legacy entry points are not silently changed by this candidate.

Actor/household/operation receipts bind a SHA-256 of the request, are committed with routine, occurrences and activity, and return the original result after later edits. Changed requests cannot reuse the identity. Receipt reads do not expose definitions. Dates and both initial occurrences must fit the shared positive four-digit civil-date representation; unusable large intervals fail atomically. Canonical UTC versions preserve all six PostgreSQL fractional digits.

## Evidence and limitations

Nine transaction tests cover RLS, anonymous/direct-write rejection, concurrent identical creates, partner operation isolation, payload mismatch, replay after a later edit, foreign assignment, invalid input/date overflow and receipt-insertion rollback. A 1,000-definition generated case checks actual initial occurrence counts, due dates and assignment. A separate 143-input comparison checks strict Effect/SQL decoding parity for representable title/schedule boundaries. PostgreSQL itself rejects unpaired UTF-16 surrogates at JSON parsing; the shared decoder rejects them before transport.

The administrative revocation test removes fixture-only dependent activity inside a rolled-back transaction before removing membership, because the historical foreign key normally prevents that deletion. It proves reauthorization of a retained receipt, not an account-removal workflow. Disposable-fixture Supabase security advisors report no issues.

Remaining: API/transport, native forms, assistant journal action, full legacy closure/edit/paused-window integration, takeover approvals, device execution and production migration approval. A successful creation transaction alone does not complete M4.
