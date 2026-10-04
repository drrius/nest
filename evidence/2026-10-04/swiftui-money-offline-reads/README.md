# Saved financial reads

4 October 2026. Balance, visited history pages and visited entry details now have durable, actor/household-scoped read snapshots in the existing protected SQLite store. Saved values appear while refreshing and carry a timestamp and explicit stale-information notice. Refresh retains the previous display until a validated replacement arrives.

Financial commands still call the unchanged online-only `readMoneyBalance`, `readMoneyHistory` and `readMoneyDetail` paths. Receipt URLs and approval lists are not cached by this change. Only unavailable/network failures permit fallback. Authorization denials purge financial read snapshots and leave the account; a fresh-process membership denial also revokes the persisted offline scope so a later offline boot cannot resurrect it. Pending commands and financial history are preserved. Latest-request tickets and leases fence delayed cache writes. Cached reads also require the SDK’s cached identity to match the displayed member, including during the interval before presentation catches up with a credential change.

## Actual local verification

- Six Foundation tests pass on the authorized Mac with real SQLite: restart, actor/household isolation, stale leases, latest-request ordering, cursor/entry separation, invalid persisted data, cache revocation preserving uncertain expenses and exact zero-sum boundary centimes.
- Twenty signed iPhone simulator tests pass, zero failures/skips: seven new Money snapshot methods, two existing Money account methods, nine session methods and two expense recovery methods. They verify offline process restart, stale notices, 401/403 denial, fresh-process denial followed by offline boot, late success/denial during account switches, contract/invalid/conflict failures and rejection of a new expense despite a saved balance.
- Strict native formatting and repository source limits pass. [Native inputs](native-inputs.json) record the exact changed source hashes. [Foundation output](core-tests.txt) and [native output](native-tests.txt) contain bounded actual test results.

The first native attempt selected a nonexistent test target and executed no tests. The next attempt found a fixture routing mismatch for `detail?eventId=…`; this was corrected to the real API route before the passing execution. Neither failed attempt counts as verification.

A real rendered pass on initial source `0b1290ab` found the entry’s saved-data warning below the fold. History and detail warnings now precede their data. The [initial finding](rendered/initial-rendered-finding.json) is retained separately from passing evidence.

## Owned rendered and hosted verification

Corrected source `b99795c903d6b91c2073c318a8de5746fb32d275` matches all1,033 native/build input hashes on the authorized Mac. The signed app uses the owned375×667 iPhone simulator, stable test Supabase identity and a read-only loopback relay to the existing test API. All POSTs are refused. Online reads populate real fictional balance/history/detail data; no new financial fixture is recorded.

After all API GETs return controlled503 responses and the process restarts, the real native app displays the exact saved CHF1.02 balance, both previously visited50+1 history pages and the previously visited oldest CHF0.01 entry. Saved notices precede history and detail data. [Current native journey](rendered/offline-history.json) records actual navigation, snapshots, failed request paths and scoped cache metadata. [Balance](rendered/fixed-offline-money.png), [history](rendered/fixed-offline-history-top.png) and [detail](rendered/fixed-offline-detail.png) show normal rendering. The notice is first at largest text/dark too; it occupies a large scrollable row, so this bounded check does not establish complete large-text readability or accessibility acceptance.

[Independent hosted reads](hosted-read-checks.json) verify both members still agree on all51 unchanged events, exact zero-sum102/−102 centimes and the oldest detail. Outsider403/anonymous401 checks pass on balance, both history pages and detail. [Restoration](rendered/restoration.json) verifies stable test origins/ordinary Today, preserved Keychain/data, empty expense/grocery journals, stopped relay and destroyed generated private key. The temporary simulator certificate expires after two days; no physical-device permissions changed.

The raw allowlisted export has [original hashes](rendered/artifact-hashes.json); repository JSON formatting is covered by the separate current artifact hash manifest. No key, auth file, configuration, certificate or database was exported.

## Remaining verification

Corrected source `b99795c9` passes routine CI37167913752 and native CI37167913761:484 Foundation cases/41 explicit skips and396 signed-native cases/11 explicit skips, zero failures. All six new Core/seven native Money snapshot methods pass without skips, along with strict formatting/source limits and actual app signing. [CI metadata](ci.json) and [bounded output](ci-excerpt.txt) record the terminal results. Both-phone acceptance, VoiceOver, real radio loss/expired refresh tokens and full two-member offline/conflict acceptance remain open. Controlled API503s do not prove airplane-mode behavior. This change is newer than the already-available TestFlight build15. No new submission, production change, hosted financial mutation, purchase or merge occurred.
