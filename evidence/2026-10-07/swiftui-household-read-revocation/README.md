# Household read revocation

An unqueued chore snapshot or grocery list returning 403 previously escaped the
membership check used by queued mutation recovery. Session presentation retained
saved household data even when a subsequent session check would deny membership.

The native sync readers now reverify the same actor and household after a read 403. Confirmed revoked membership reaches existing session cleanup, which removes
the active offline scope and hides household presentation. A current member keeps
saved data and the original forbidden outcome; uncertain commands are preserved.

## Reproduction

Signed app-hosted tests on a fresh iPhone SE simulator reproduce one chore failure
and two grocery failures before the fix. The controlled transports return actual
HTTP 403 responses to the native typed client. They do not use hosted accounts,
provider calls or production data. The original simulators are untouched; each
owned empty simulator is deleted after execution.

- [Chore before](chore-before.json): revoked read leaves `.ready` rather than `.notMember`.
- [Grocery before](grocery-before.json): revoked read leaves `.ready`; a valid-member refusal never checks `/v1/session`.

## Verification

The [fixed-source run](after.json) passes 25 signed app-hosted tests with zero
failures, skips or runtime warnings. The four new refusal cases check both revoked
and still-current membership. Revoked cases also assert that saved membership
cannot be restored from the offline scope. Existing queued chore recovery,
coalesced refresh, grocery offline retry and account-switch tests also pass.
The [owned simulator cleanup](cleanup.json) is recorded. Source limits and
whitespace checks pass.
This is native model/HTTP/SQLite verification, not rendered UI or physical-phone
acceptance. Build 23 remains unchanged; the shipping fix needs subsequent CI and a
batched candidate before claiming availability on phones.
