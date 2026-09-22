# Legacy recurring adoption audit

## Identity and old-writer boundary

The additive fence migration retains both legacy rows and financial history. The private, immutable adoption map binds a household, the original rule ID, the identical native rule ID, the reviewed source hash and the authorizing member. API roles cannot read or insert mappings. This boundary alone does not opt in any rule, grant a mandate or provide an adoption command.

The old rule update/delete and draft insert/update/delete triggers reject writes after adoption. Both old and new draft associations are checked, so detaching a draft cannot evade the fence. Null recurring associations remain unaffected. Native configuration commands continue to operate on the native rule. An old confirmation that reaches its draft update after posting is rejected transactionally: its event, allocations, ledger, activity, notifications and operation receipt all roll back.

The future authorized adoption transaction must acquire the per-household/rule advisory key **before** locking or changing the original rule, reconcile retained drafts and reviewed configuration, update the legacy row (including when already inactive), and insert the map atomically. It must refuse stale review, pending/unreconciled drafts, identity collisions and overlapping historical coverage. The fence fixture seeds a mapping with privileged SQL only to test these lower-level protections; it is not evidence that authorized adoption is implemented.

Old code can already hold a rule or draft row before reaching a trigger. The trigger therefore tries the advisory key without waiting and raises a retryable serialization error if adoption owns it. This avoids a row/key lock inversion. Once it owns the key, it locks the original rule FOR SHARE before checking the map. The stronger row lock is necessary: a real repeatable-read test demonstrated that FOR KEY SHARE allowed a stale writer to miss a committed adoption map after a non-key rule update. FOR SHARE makes that stale writer serialize and abort.

## Deliberately reused legacy code

`tests/database/legacy-recurring/writer-provenance.json` pins verbatim next-date, generator and active-state functions from household-os commit `4a528c96caf41515a70291ccecbba9d7b35e3349`, including source and fixture SHA-256 hashes. The actual old confirmation function is the already audited `legacy-money/draft-confirmation.sql`. These functions are test fixtures only; no old scheduler or infrastructure default is installed in Nest.

The minimal original read fixture omitted the old UUID default on draft IDs. The fence fixture restores that audited default so the real generator can run. It does not substitute a fake generator. Unadopted generation and active-state changes remain covered, alongside an actual concurrent generator/adoption lock race and a stale repeatable-read draft writer.

## Remaining acceptance

Authorized adoption commands, versioned eligibility/coverage review, native opt-in and corresponding private AI proposal/approval are still outstanding. The boundary is tested only in disposable local PostgreSQL; hosted migration, production cutover and physical-device verification remain separate gates.

## Authorized source review and conservative coverage

The read boundary hashes the full raw rule and an ordered digest of every retained draft and linked immutable financial event, with UTC normalization. It includes mapping/native-identity availability. No assumption is made that an old draft timestamp advances. The bounded response exposes the existing inventory summary, exact source token, covered-through date and explicit blockers; it does not return all raw history to the phone.

Pending drafts, inconsistent posted/event relationships, unsupported historical dates and existing native identity collisions block future adoption. Already-adopted records expose the retained mapping instead. Both current household members may review financial context; outsiders and unauthenticated/service API roles cannot use this endpoint.

Because old drafts have no immutable cadence revision, their current rule cadence cannot reliably describe every historical obligation. Coverage conservatively uses the later of week-end and month-end around the latest retained draft or linked event date, including dismissed drafts. The future opt-in UI must display this boundary and the first new cycle explicitly. A cadence transition may skip an overlapping month/week; it must not silently backfill it. Supported-date exhaustion remains an explicit blocker.

## Explicit adoption transaction

The shared adoption command binds the raw source token and complete new configuration/first due date. It requires the current two household members, reconciled retained drafts, an unused identical native rule ID, a prospective start and the exact first non-overlapping native cycle. It acquires operation → adoption key → legacy row → native rule key → ledger/category → approval locks. Exact AI execution requires the separate `recurring.adopt-legacy` approval; direct native Save is explicit mandate authorization. The private native write helper is called only after proving absence under its rule lock.

Source deactivation, native rule/revision/execution coverage, immutable adoption identity and operation receipt commit together. No historical event or draft is changed, and adoption itself posts no expense. Exact retries return the original receipt; explicit abandonment serializes with Save and prevents late execution. Direct recovery cannot disclose AI operation receipts or another member's operations.

New adoption writes require READ COMMITTED, matching PostgREST. A repeatable-read snapshot can miss a newly inserted draft even after later row/advisory locks, because the old rule row need not have changed. Rejecting frozen-snapshot adoption is deliberate; it complements the old-writer serialization fence rather than assuming a lock refreshes a transaction snapshot.

Disposable tests execute the real legacy generator and native worker: adoption wins the old row/key race without deadlock or partial drafts, the old generator stops, and the adopted rule posts exactly one zero-sum native cycle. Injected failures at revision, mapping and receipt insertion roll back source deactivation and approval consumption as well as the new mandate. Hosted operation and physical-device opt-in remain unverified.
