# Build14 actual native expense journey

Verified 3 October 2026 against native source `bded62ec`, the owned iPhone simulator and the stable nest-test API. This is actual native execution against fictional test accounts, not physical-phone acceptance.

- Entered a unique description and CHF1.01 through the native keyboard, reviewed CHF0.51/0.50 allocations, edited the preserved draft, reviewed again and selected Save exactly once.
- The app displayed “Expense recorded.” and opened the matching history detail.
- Both test members independently read the same single new ledger event. Event count rose from13 to14; member balances moved from+50/−50 to+100/−100 centimes and remained zero-sum. Outsider detail access returned403; anonymous access returned401.
- The recorded local receipt survived process termination/relaunch. The app did not offer another Save. The originating member could read its operation receipt; the other member could read shared ledger history but could not read the private operation receipt.
- Explicitly selecting Start another expense cleared the completed local receipt and opened a blank draft. Returning to Money showed CHF1.00. The ordinary Today view was restored.

The fictional expense remains in append-only test history. No production data, provider configuration, approval decision or payment transfer was changed. Read verifiers sent no financial writes.

The first keyboard assertion failed because the driver's keyboard identifier was on an Other node rather than its label/type. Corrected observation of the actual keyboard passed without changing app code. Later command-line API reads returned401 after their fixture tokens expired; fresh independent password sessions for existing fictional accounts restored verification without changing the app Keychain or repeating Save.

This proof does not establish Apple sign-in, both-phone acceptance, offline expense initiation, a lost-response retry, all financial approval families, accessibility acceptance or complete Money readiness. Routine/native CI evidence remains in the [build14 checkpoint](../swiftui-build14/README.md); no implementation changed here.
