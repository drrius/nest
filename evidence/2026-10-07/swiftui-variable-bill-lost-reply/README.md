# Variable bill recovery after a lost hosted reply

Money's Saved changes now discovers the signed-in member's saved variable bill
from local persistence. Opening it does not require a live recurring-rule read.
The lookup checks the member and session generation before and after reading.
The view rejects stale results and uses a stable container so its task starts
even before a saved entry is available.

Two controlled signed-app model cases pass, including local discovery without
HTTP and rejection of another member, a stale generation and signed-out access.
These cases use controlled transport, not hosted financial execution.

The actual signed native UI recorded one fictional CHF 0.02 bill against nest-test.
The relay forwarded that one command, observed its successful committed receipt,
dropped the response and blocked subsequent API traffic. The app retained an
unconfirmed entry rather than reporting success. Following the view fix, a native
restart check passes and discovers the entry from Money while offline. Its saved
operation and exact serialized body are unchanged across restart.

[Offline recovery rendering](offline-recovery.png) and [recorded receipt](recovered.png) shows the pending explanation,
Check and retry, cancellation and the original amount and shares. The reconnect check passes: Check and retry retrieves the existing receipt,
View recorded expense opens its detail, and Done clears the saved entry. The
partner native API client reads that same expense and covered cycle. Ordinary
cancellation of the owned rule preserves the recorded history. The restarted relay rejects every POST and preserves
the original request log, so the remaining recovery cannot record another expense.

[Database reconciliation](reconciliation.json) preserves all 66 original events,
108 allocations and 132 ledger rows by their original identifiers and full-row
hashes. The only additions are one event, two allocations and two ledger rows.
Each share is one centime; the deltas are minus one for Alex and plus one for Sam.
Both resulting balances are zero. Five protected meal and grocery fingerprints
remain unchanged. Production data was not touched.

The first UI observer failed before entering the bill form or sending a POST.
A corrected observer then recorded the bill once. The original empty recovery
view failed its restart check; both failures remain in the native result history.
No financial command was replayed to repair those failures.

Both corrected signed targets build; strict Swift formatting and source limits pass.
The six successful hosted/native methods have zero skips. Two earlier observer/
rendering failures remain recorded. Both original clients restore their actor,
household, 64 empty journals, stable API origin, display settings and local privacy
choices. The relay stops and its private key is destroyed; public test certificates
expire after two days. Exact-source routine37607214163 and native37607214035 pass for4d0c0d09.
[CI receipt](ci-result.json). Guarded hosted UI actions remain separate Mac
evidence. Full phone/accessibility acceptance remains unverified.
Build 21 predates this shipping fix; no new beta has been submitted.
