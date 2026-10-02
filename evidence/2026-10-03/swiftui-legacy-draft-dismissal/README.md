# Native retained-draft dismissal

3 October2026, local Zurich date. Exact app source `8ddb0e357732eacb2a3b639b829eaa633d32f945` on `codex/swiftui-legacy-draft-dismissal`. This is source/native test verification, not final M7 acceptance.

A retained pending recurring draft without a financial entry opens fresh household-bound context. The member reviews its original terms and explicitly confirms dismissal. Missing old terms and unsupported dates remain honest retained values; dismissal posts no expense/payment, changes no balance and does not alter or opt in the old recurring rule. Posted, linked and shopping drafts cannot authorize this action.

The actor/household SQLite journal stores the original opaque raw token, full reviewed snapshot and operation before sending. Fresh preflight rejects changed raw tokens or terms, scope, source, status, linkage and offline initiation. Loading/foregrounding checks receipts only. Explicit retry reads the exact receipt first, then validates the original context. Cancellation is durable and a committed dismissal wins; unresolved outcomes cannot be discarded. Full terminal receipts cannot regress or substitute their terms. Same-term reloads create fresh review identities; background and account replacement invalidate old callbacks.

## Verification

- [Nest37071197923](https://github.com/drrius/nest/actions/runs/37071197923): SUCCESS for the exact source.
- [SwiftUI37071197639](https://github.com/drrius/nest/actions/runs/37071197639): SUCCESS.443 Foundation tests with41 explicit skips;310 signed iPhone-simulator tests with six explicit skips;zero failures. All five new LegacyDismissalTests and eight LegacyDismissalModelTests passed without skips, alongside strict formatting, source limits and actual app signing.
- Seven named local cases, zero failures/skips: two strict Effect wire fixtures plus five SQLite/HTTP/isolated PostgreSQL/PostgREST retained-runtime integration cases. Command: `NEST_TEST_PG_BIN=/tmp/nest-postgres/usr/bin NEST_TEST_POSTGREST_BIN=/tmp/nest-postgrest/postgrest node --test --test-concurrency=1 --test-reporter=tap tests/api/native-legacy-dismissal-wire.test.mjs tests/integration/legacy-dismissal-native.test.mjs`. Actual TAP: `/tmp/nest-swiftui-legacy-dismissal-local.tap`. A sandbox outer-file pass was not counted.
- Earlier unchanged server audit:12 named direct dismissal API/database/conflict cases passed; `/tmp/nest-legacy-dismissal-audit.tap`. These protect existing server behavior and are not SwiftUI presentation evidence.
- Native cases cover both members, exact original terms, committed and uncommitted lost replies, restart with no replay, changed-token recovery, durable lost cancellation, seven preflight refusal variants, stale same-term callbacks/background reads, four delayed account variants and SQLite staging/cleanup failures.
- First native run37070971254 stopped on13 formatting findings. The corrected passing source retains every gate. Native log: `/tmp/nest-direct-dismissal-passing-native.log`.

## Remaining boundaries

Private AI dismissal approval destination, legacy confirmation/adoption and full financial-history reconciliation remain incomplete at this checkpoint. The existing registered AI proposal is not a completed native approval flow. The owned Mac timed out on3 October; source synchronization, rendered Quiet interactions and both phones remain unverified. Hosted nest-test currently has no populated legacy history. TestFlight remains build13 and does not contain this slice. No new beta, cloud build, deployment, hosted mutation, production access, purchase, merge, PR or automation occurred.
