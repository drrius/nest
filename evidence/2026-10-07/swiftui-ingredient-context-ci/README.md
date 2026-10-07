# Ingredient context CI correction

The delivered native run 37642938666 finished 510 app tests with 57 guarded skips
and one failure, then was cancelled after reaching its time budget. The failing
account-switch case rejected the late ingredient week read, but its caught error
was not the expected OfflineFailure.sessionChanged. This is retained in
[CI failure](ci-failure.json); cancellation is not a passing native gate.

The shared week-read helper rejects changed accounts with NestAPIFailure.signedOut.
Ingredient review previously rechecked its own context only after successful
week reads. It now also rechecks context when that shared read throws, preserving
its existing sessionChanged contract. Errors for an unchanged context still
propagate. The shared week ticket, denial invalidation and pending operations
remain intact. No assertion is weakened or removed.

Twenty-one signed app-hosted checks pass without failures or skips on a separate
owned simulator, including the exact failed method, recipe/library account changes,
ingredient review and held denial races. [Native results](summary.json),
[executed hashes](source-hashes.json), [cleanup](cleanup.json).
Source formatting and limits pass. This is native session/API/SQLite execution
with controlled authentication/HTTP, not hosted or physical-phone acceptance.
The owned simulator is deleted and the original clients/data are not used.
Build 22 remains unchanged; this shipping fix needs the next consolidated candidate.
Current-source CI remains required before merge or candidate acceptance.
