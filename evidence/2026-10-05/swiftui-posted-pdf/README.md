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

## Scrolling finding and native read verification

The first read-only navigation run reaches the populated Money dashboard but
stalls during scrolling. At3 minutes15 seconds the actual app consumes100.1% CPU;
a one-second sample places the main thread in repeated SwiftUI view-graph/lazy
layout updates. Raw samples/screenshots stay private on the authorized Mac.
The owned Xcode process is intentionally interrupted after inspecting this
behavior, returning75. All64 journals remain empty and large/light are restored.
It is not an accessibility, navigation or performance pass.

The bounded dashboard now uses a regular outer stack, preserving the virtualized
full-history screen. Its first read-only run completes after the Mac reconnects:
one pass, zero failures/skips, but791.797 seconds and an animation-idle timeout.
That run alone is not responsiveness proof. A new awake normal-text run passes
in17.717 seconds. The first maximum-text observer stops after12 small drags while
still inside the five recent entries; its31.769-second failure is retained. The
observer now allows32 drags. This changes no app data, font scale or audit policy.

The final signed source passes the same actual history/detail/receipt-target
journey at normal/light and maximum/dark, one pass each with zero failures/skips.
The maximum method takes54.958 seconds; each returns to Today. All786 captured
app/app-test/manual-test/project inputs match the Mac and Linux. Both runs verify
the stable test origins and disabled push, preserve the existing Keychain/data
and64 empty command journals, and restore large/light settings. This resolves the
observed dashboard navigation reproduction; it is not broad scrolling profiling,
VoiceOver, a clean accessibility audit or phone acceptance.

The real authenticated `NestAppTests/HostedPDFReceiptTests` method also runs:
one pass, zero failures/skips,5.884 seconds. It obtains the existing stored session,
verifies membership through the test API, reads the recorded event/detail and
downloads through native URLSession. HTTP200, application/pdf,640 bytes, PDF magic
and exact SHA256 all pass. Its JSON attachment contains no credential or signed
URL. See [native verification](native-read-verification.json). A subsequent hosted
read matches all six complete financial/activity/Storage fingerprints, retaining
62 events and two objects. [Fingerprints](read-only-fingerprints.json). No second
expense, beta, model call, push activation, production action or merge occurred.

This moves the posted-receipt workflow forward but does not close M7. Actual PDF
browser rendering, partner native viewing, full accessibility,
both phones and live AI receipt handoff remain open. Source1463a805 passes routine
[Nest37319142790](https://github.com/drrius/nest/actions/runs/37319142790);
[SwiftUI37319142748](https://github.com/drrius/nest/actions/runs/37319142748) passes. CI reports496 Foundation tests/41 skips and419 signed-native tests/12 skips,
zero failures; the guarded hosted download is explicitly skipped. CI does not
execute the opt-in hosted/UI methods. The dashboard fix and larger scroll budget
are newer than that commit; their current-source CI remains pending.
