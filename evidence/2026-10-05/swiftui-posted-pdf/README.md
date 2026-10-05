# Posted PDF expense — 5 October 2026

The real signed SE3 app selects the existing, clearly marked 640-byte local PDF,
uploads it through the separate test API, reviews a CHF0.02 equal-split expense,
presses Save once and receives “Expense recorded.” It opens the recorded detail
and verifies the receipt control's44-point minimum. No second expense was posted.

Hosted postflight proves exactly one new named fixture and one claimed PDF upload:
two allocations total2 centimes and two ledger entries sum to zero. The immutable
upload identity and Storage metadata match the expected MIME, size and fixture
SHA256. The original61 complete event rows, allocations and ledger rows retain
their exact preflight fingerprints. The new fixture deliberately changes each
member's balance by one centime in opposite directions; balances are not claimed
unchanged. This permanent synthetic test entry and its receipt remain in nest-test.
See [hosted verification](hosted-verification.json). Production is untouched.

## Native result and observer correction

The initial posting method reaches all the steps above and normally clears its
saved expense/upload. Its final assertion fails because Choose PDF is offscreen
after the form resets. Xcode exits65; this is not a whole-method pass. The harness
independently confirms64 empty command journals and restored large/light settings.
The corrected assertion reveals the button before checking it, but the one-time
posting method has not been rerun. A fresh posted expense is unnecessary and would
produce another append-only fixture.

Creation requires explicit runner opt-in and a preflight proving that the named
fixture does not exist. Do not enable that opt-in again for this existing record.
Separate opt-ins support read-only existing-entry navigation and an authenticated
native byte download using the actual stored member session and API clients.
The latter must compare the independent downloaded bytes, MIME and SHA256; intent
or Storage metadata alone does not prove that check.

## Scrolling finding and pending run

The first read-only navigation run reaches the populated Money dashboard but
stalls during scrolling. At3 minutes15 seconds the actual app consumes100.1% CPU;
a one-second sample places the main thread in repeated SwiftUI view-graph/lazy
layout updates. Raw samples/screenshots stay private on the authorized Mac.
The owned Xcode process is intentionally interrupted after inspecting this
behavior, returning75. All64 journals remain empty and large/light are restored.
It is not an accessibility, navigation or performance pass.

A one-line, uncommitted experiment changes the bounded dashboard's outer lazy
stack to a regular stack, preserving the virtualized full-history screen. The
same read-only check starts in a fresh result directory; it builds and passes
signature, test-origin and push-disabled checks. Its runner PID54768 was observed
live, then the Mac became unreachable over both SSH and Tailscale. The result is
unknown; inspect the existing process/result before any further run. The byte
download method has not run. Ordinary Today restoration after this run is also
unverified. No new beta, model call, push activation, production action or merge.

This moves the posted-receipt workflow forward but does not close M7. Independent
bytes, actual PDF browser rendering, partner native viewing, full accessibility,
both phones and live AI receipt handoff remain open. Source1463a805 passes routine
[Nest37319142790](https://github.com/drrius/nest/actions/runs/37319142790);
[SwiftUI37319142748](https://github.com/drrius/nest/actions/runs/37319142748) remains
running. CI does not execute the opt-in hosted/UI methods. The dashboard experiment
remains outside that commit and has no claimed verification.
