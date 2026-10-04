# Saved financial reads

4 October 2026. Balance, visited history pages and visited entry details now have durable, actor/household-scoped read snapshots in the existing protected SQLite store. Saved values appear while refreshing and carry a timestamp and explicit stale-information notice. Refresh retains the previous display until a validated replacement arrives.

Financial commands still call the unchanged online-only `readMoneyBalance`, `readMoneyHistory` and `readMoneyDetail` paths. Receipt URLs and approval lists are not cached by this change. Only unavailable/network failures permit fallback. Authorization denials purge financial read snapshots and leave the account; a fresh-process membership denial also revokes the persisted offline scope so a later offline boot cannot resurrect it. Pending commands and financial history are preserved. Latest-request tickets and leases fence delayed cache writes. Cached reads also require the SDK’s cached identity to match the displayed member, including during the interval before presentation catches up with a credential change.

## Actual local verification

- Six Foundation tests pass on the authorized Mac with real SQLite: restart, actor/household isolation, stale leases, latest-request ordering, cursor/entry separation, invalid persisted data, cache revocation preserving uncertain expenses and exact zero-sum boundary centimes.
- Twenty signed iPhone simulator tests pass, zero failures/skips: seven new Money snapshot methods, two existing Money account methods, nine session methods and two expense recovery methods. They verify offline process restart, stale notices, 401/403 denial, fresh-process denial followed by offline boot, late success/denial during account switches, contract/invalid/conflict failures and rejection of a new expense despite a saved balance.
- Strict native formatting and repository source limits pass. [Native inputs](native-inputs.json) record the exact changed source hashes. [Foundation output](core-tests.txt) and [native output](native-tests.txt) contain bounded actual test results.

The first native attempt selected a nonexistent test target and executed no tests. The next attempt found a fixture routing mismatch for `detail?eventId=…`; this was corrected to the real API route before the passing execution. Neither failed attempt counts as verification.

A real rendered pass on the initial source found the entry’s saved-data warning below the fold. History and detail warnings now precede their data. The initial rendered attempt is a finding, not a passing offline-detail check; current-source rendering remains pending.

## Remaining verification

Exact-source CI, owned rendered/hosted offline navigation and both-phone acceptance remain pending. This change is not included in the already-available TestFlight build15. No new submission, production change, hosted financial mutation, purchase or merge occurred.
