# Native financial history

The signed SwiftUI client on the owned narrow iPhone simulator reads the separate fictional nest-test household. Initial page/failure/retry/detail checks use `9db50589`. The navigation correction, detail/tab return, explicit refresh, largest-text/dark checks and restored app use inputs matching `52fc69162bd3911d1d778a862767d328ecb1b217`. [Final native inputs](final-native-inputs.json) contain all1,028 matching native/build-helper hashes. The stable test backend remains `83a5a015`; no production data changed.

## Verified outcomes

- Both regular test members read identical50+1 pages, with no duplicate event IDs and the same oldest detail. Outsider and anonymous history/cursor/detail reads return403 and401. [Hosted expectations](hosted-summary.json).
- The fixture adds35 clearly labeled personal CHF0.01 expenses through once-guarded authorized commands. Each assigns its single centime entirely to its payer, so both balance deltas are zero. All16 earlier event summaries remain intact; the ledger now contains51 events with unchanged102/−102-centime balances. The fictional append-only records are deliberately retained. [Final reconciliation](final-hosted-summary.json).
- A real older-page GET fails503 before reaching the test API. Existing history stays visible, the error is truthful, and Load older entries remains available with the original cursor. Native Retry reads that same cursor and appends the one oldest entry; the notice and exhausted-page control disappear. [Failure](fault.json), [retry](retry.json), [requests](requests.jsonl).
- The oldest entry opens its real authorized detail. The original app then unexpectedly refetched page one on return, dropping the loaded older page. The corrected full-history task preserves loaded entries when its view reappears; the recent preview still refreshes. Actual detail return and Today→Money tab return retain the oldest row, destination and scroll position. Explicit Refresh resets the loaded51 entries to the first50 and restores the cursor. [Navigation regression proof](preservation.json), [return screen](preserved-history-return.png).
- Older-page failure/retry and oldest-detail corner taps pass at normal text and largest-text/dark, with targets at least44pt and within the narrow viewport. [Largest-text proof](largest.json), [failure screen](largest-failure-dark.png), [loaded screen](largest-loaded-dark.png). This proves those bounded interactions, not complete accessibility or phone usability.

The native fault relay forwards only scoped GETs and refuses every POST. Native checks issue no financial mutations; final independent reads prove unchanged complete histories/balances. New fixture commands are prepared and persisted before delivery, never blindly repeated after uncertain delivery.

## Verification and restoration

Eight focused existing contract, isolated PostgreSQL and real API/AI-tool tests pass with zero failures/skips: exact keyset ordering/ties, insertion-safe cursors, retained correction/receipt privacy, foreign/missing cursors, revoked access and retained dates outside native ranges. [Actual test output](focused-tests.txt). Strict Mac formatting/source limits, all1,028 hashes, actual Xcode builds and signing pass. [Corrected build](preservation-build.json).

Exact-source Nest37162913102 and SwiftUI37162913113 both pass. Native CI executes478 Foundation methods/41 explicit skips and389 signed-native methods/11 explicit skips, zero failures; strict formatting/source limits and actual app signing pass. [Terminal CI](ci.json), [actual log excerpt](ci-excerpt.txt). These controlled tests are separate from the hosted/rendered checks above.

The signed corrected app is restored to stable test origins, ordinary text/light appearance and signed-in Today. Grocery/expense journals are empty; data, Keychain and all fictional history remain. The exact owned relay is stopped and its generated private key destroyed. A temporary two-day public certificate remains only on the owned simulator. [Restoration](restoration.json), [Today](restored-today.png).

One observer stopped after selecting Money because its optional logging argument was absent. It was resumed from the inspected installed executable, verified identical to the built candidate, without reinstalling or sending a financial command. Scroll-to-bottom then avoided unnecessary repeated viewport scans. [Installed executable proof](preservation-installed.json). No credentials, keys, database, configuration or certificate files were exported; [artifact hashes](artifact-hashes.json) record the raw allowlisted export.

TestFlight build14 predates this fix. All financial approval/recurring families, membership-change journeys, VoiceOver/haptics, physical radio loss, both phones and full M7/M9 acceptance remain open. No purchase, production mutation/migration, financial-history deletion, model call, PR, merge or new release occurred.
