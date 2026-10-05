# Two native clients: alternating chores and handovers

Status: **prepared, not yet verified**. The current source adds six guarded
XCTest files for one fictional daily alternating chore in nest-test. These are
manual opt-in checks, forbidden on physical phones and limited to the two owned
simulators and normal fictional identities. Their existence and compilation do
not prove a successful handover or completion.

The intended journey creates the chore once, independently reads it through
both normal native SDK sessions, cancels a handover review, sends one request
with a committed lost reply, verifies the sender's real server refusal, and has
the recipient cancel then accept through their own native UI. The sender then
explicitly retries the original request after acceptance. A reverse request and
recipient decline keep the accepted responsibility. Finally, a completion queued
on one unavailable client must converge with the other client's native online
completion, retaining its canonical actor and exactly one alternating successor.
Normal native archive, empty scoped journals and stable origins end the pass.

The Mac setup controller was dispatched as PID95779 at
`/private/tmp/nest-native-chore-pair-setup.py`. Its output directory is
`/private/tmp/nest-native-chore-pair-setup-20261005`. SSH subsequently timed out;
Tailscale reported the Mac offline. This is an observation failure, not proof
that the process stopped. Inspect that exact PID, process command, kernel lock,
prepare logs and any XCTest results before resuming. Never repeat creation based
on a missing observation. No request relay was started by the continuation.

[Baseline](baseline.json) records a read-only hosted inspection: zero exact-named
routines, unchanged six financial/activity/Storage fingerprints, and original
IDs/digests for 19 routines, 24 occurrences, five completions and four transfers.
These establish retained data before subsequent owned actions; they do not prove
that a local Xcode build or UI test passed. No credentials, private config,
personal row contents or session tokens are exported.

Local Swift source limits, repository lint and touched Markdown/JSON/YAML format
checks pass. The [prepared source](prepared-source-inputs.json) records 798 inputs at0cc30d88;
Mac equality, native compilation and manual journey outcomes remain pending. CI now builds the UI test target without executing hosted fixture
actions; default SDK fixture checks skip unless explicitly enabled. A temporary
private relay's [command filter](harness-validation.json) passes 11 synthetic checks without
starting a server or making a network request. That is test-harness validation,
not SwiftUI/offline execution proof.

Both phones, real radio loss, broader membership/conflict cases, VoiceOver and
complete M4 acceptance remain open. No model call, beta, production operation,
purchase or merge occurred.
