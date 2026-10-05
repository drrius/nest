# Two native clients: alternating chores and handovers

Status: **creation, keyboard dismissal and request cancellation verified;
handover/completion journeys still in progress**. The current source adds six guarded
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
Native CI at0cc30d88 now passes:496 Foundation/41 skips,425 signed-app/16
skips, zero failures; format, limits, push-disabled signing and the manual UI
target build pass. [Native CI](ci-native.json), [source CI](ci-routine-source.json)
and [docs CI](ci-routine-docs.json) retain exact heads. Hosted manual journey
outcomes and source equality with its eventual final successful run remain open. CI now builds the UI test target without executing hosted fixture
actions; default SDK fixture checks skip unless explicitly enabled. A temporary
private relay's [command filter](harness-validation.json) passes 11 synthetic checks without
starting a server or making a network request. That is test-harness validation,
not SwiftUI/offline execution proof.

Both phones, real radio loss, broader membership/conflict cases, VoiceOver and
complete M4 acceptance remain open. No model call, beta, production operation,
purchase or merge occurred.

## Native creation checkpoint

The final setup run executes ten real native methods with ten passes, zero
failures/skips. Native keyboard Done dismisses the title keyboard before the
pickers and final Add; one daily alternating routine is created. Both normal
SDK identities independently read that exact routine/occurrence/first assignee,
both native UIs display its cadence/original rotation, and native request review
Cancel leaves no transfer. Both clients finish on Today with64 empty journals.
[Results](setup-native-results.json), [fixture](created-fixture.json),
[restoration](setup-restoration.json). All798 compiled source inputs match Linux;
SHA25699735560a3dd70ce98ac329c53d38859f5efa41600b95a47567f1ab08de75eb2.
The later edit-Return test adds a test-only method after that input capture.

Two earlier creation tests failed before the final Add: one timed out synthesizing
an assignee event while the Mac became unavailable; the second observer repeatedly
dragged inside an open keyboard. Both failures are retained on the Mac. Each was
followed by actual zero-row/empty-journal inspection before another attempt.
The second test had already failed when its owned simctl diagnostics collector
hung; only that collector was interrupted so Xcode could seal its failed result.
No unrelated process or journal was cleared.

The video showed that tapping the navigation title did not dismiss the keyboard.
The shared create/edit title field now has native Done, Return submission and
explicit focus dismissal. Actual create Done and edit Return/no-save methods pass;
Return preserves the exact title and leaves Save disabled. Full text-size,
VoiceOver and both-phone keyboard acceptance remain open. These shipping changes
are newer than the passing0cc30d88 CI and build17; their CI is pending.
