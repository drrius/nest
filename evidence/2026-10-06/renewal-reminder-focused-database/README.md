# Focused renewal reminder database verification

Eight existing meaningful tests pass on disposable local PostgreSQL18.6 clusters: reminder timing and removed/changed/disabled invalidation, recipient validation, household isolation, protected receipts, immutable retries and version conflicts, cancellation fences/races and transaction rollback. No test is skipped. [Actual TAP](postgres18.tap), [source and command](result.json).

The storage test preserves saved reminder settings after ordinary renewal removal and refuses new settings against the removed revision. The due test returns no due time for a removed renewal. This supports retaining historical enabled settings without treating the removed item as deliverable. It does not prove live scheduling or APNs delivery.

The first invocation lacks NEST_TEST_PG_BIN and the second uses a missing historical binary path. Both fail all eight tests before database behavioral assertions run. [Missing configuration](missing-configuration.txt) and [stale path](stale-path.txt) remain recorded. The corrected invocation uses the existing local18.6 fixture binaries; no service or package is purchased or installed.

These fixtures simulate Auth/Storage and load focused migration dependencies. Hosted PostgreSQL17.6, the complete deployed chain, phone rendering and actual worker delivery remain separate checks. No hosted or production database is contacted.

The evidence checkpoint at `3ebbc180` passes [routine CI](routine-ci.json). That workflow runs its configured focused checks; the eight renewal tests above were run locally and are not claimed as routine CI execution.

Six focused pure-domain tests also pass at `a4d1949c`, including property checks for recipient privacy, collision-free reminder identities and civil cancellation dates, plus stale-item invalidation and invalid-input refusal. [Domain TAP](domain.tap), [exact sources](domain-result.json). These are local domain checks, not native execution or hosted delivery.
