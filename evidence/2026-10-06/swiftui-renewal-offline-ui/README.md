# Native renewal cache UI across cold restart

This dated, simulator-only acceptance test uses the shipping SwiftUI app and its
normal authenticated test API. Both member cases passed with zero failures or skips.
Each has one real 200 list response followed by two controlled 503 renewal reads.
[Results](results.json), [measured date/frame observations](outcome.json) and
[restoration](restoration.json) record the actual execution. A loopback HTTPS relay forwards each member's first
renewal list read unchanged. After validating that real response is the authorized
household's empty active list, it returns 503 unavailable responses only for that
actor's subsequent renewal list GETs. No renewal response or local cache body is
seeded or synthesized.

The UI test loads the real empty list, asserts no stale notice, taps normal Refresh,
then checks the empty list and "Saved information from … Refresh when online."
notice. It terminates and launches the app, rechecks the original member identity,
opens Renewals and asserts the same capture-date notice and empty list. It returns
to Today. Native screenshots and accessibility trees record all four stages.

The relay accepts only fixed startup GETs and the renewal list for Test Alex and
Test Sam in the fictional household. It rejects every write verb. JWT issuer and
subject guards precede forwarding; the upstream server still validates each JWT.
Only actor, path, status, phase and timestamps are recorded, never authorization
headers or bodies. The upstream is exclusively the stable nest-test API.

This proves renewal-cache UI persistence across a cold app restart while startup
and authentication remain online. It does not prove whole-device network loss,
offline authentication restoration, physical radio loss or physical-phone behavior.
The two-member real API/SQLite test and earlier 35 focused cache tests are recorded
separately in [the cache implementation evidence](../swiftui-renewal-offline-reads/README.md).

One ephemeral two-day localhost certificate is trusted only on the two owned
simulators. The Mac trust store and original Keychains are unchanged. The relay is
stopped, its private key and override are destroyed, and the signed stable-API app
is restored without deleting its data. Public simulator trust entries are left to
expire. Restoration records original actor/household scopes, 64 empty intent
journals, large text, light appearance and Today screenshots. The renewal snapshot
table is a read cache and excluded from intent counts. No hosted command is sent.

All 10 exported PNGs were inspected. Strict native formatting and source limits
pass. The 1089 [prepared source inputs](source-input-hashes.json) match the executed
Mac build. The audit controller/relay/export scripts are retained in controllers;
private signing configuration and full native result stores remain on the Mac.
Run `python3 verify_inventory.py` here for tracked artifact checks, or add
`--working-tree` to compare the current native inputs with the prepared snapshot.
The ordinary CI guard skips this manual relay method.
