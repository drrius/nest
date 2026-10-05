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

## Native PDF browser

The later read-only browser method passes with zero failures/skips in23.439
seconds. It opens the existing receipt through the real API, waits for Apple's
browser/WebView, checks a44pt dismissal target, returns to the same recorded entry
and selects Today. Independent inspection of the [reviewed screenshot](native-browser.png)
confirms the actual synthetic PDF page and text rendered; a WebView alone would
not prove this. Only the public test hostname appears in its address display.
No signed URL or credential is exported. All786 captured inputs match again,
signature/origin/push-disabled gates pass,64 journals remain empty and large/light
settings are restored. All six hosted fingerprints remain exact after this check.
[Native browser verification](native-browser-verification.json), [fingerprints](browser-fingerprints.json).
The refactored shared navigation helper also passes again at maximum/dark in54.111
seconds, with normal Today/settings/journal restoration. Earlier JSON checkpoint
flags for unverified browser rendering are superseded by this separate result.

This moves the posted-receipt workflow forward but does not close M7. Partner
native viewing, full accessibility, both phones and live AI receipt handoff remain
open at this checkpoint. Source `2def44b6` passes both required workflows:
[Nest37324793105](https://github.com/drrius/nest/actions/runs/37324793105) and
[SwiftUI37324793021](https://github.com/drrius/nest/actions/runs/37324793021).
CI reports496 Foundation cases/41 explicit skips and419 signed-native cases/12
explicit skips, zero failures, strict formatting/source limits and actual signing.
The guarded hosted download and manual UI checks do not execute in routine CI;
their actual local native evidence is recorded above. Earlier `dd9ac9bd` routine
CI passed, but its SwiftUI workflow was cancelled by the next source push.

## Partner receipt and account boundaries

The later normal account sequence passes eight actual native methods, each with
one pass and zero failures/skips. The app signs out Test Alex through Profile's
confirmation, the guarded SDK fixture authenticates Test Sam, and a fresh app
launch independently shows Test Sam's verified Profile. The normal SQLite scope
matches the partner and the same household; all64 journals stay empty. Optional
quick setup belongs only to that fictional partner. There is no shipping password
sign-in feature or Apple authentication bypass.

That partner opens the same expense/PDF in Apple's browser, returns to the same
entry and Today, then downloads the exact640-byte application/pdf through the
normal native API clients. The byte report independently binds the expected
partner identity, household and SHA256. The [reviewed partner screenshot](partner-browser.png)
shows the actual synthetic PDF text and only the public hostname, with no signed
URL or credential. Native dismissal remains at least44pt. Test Sam signs out
normally; the SDK restores Test Alex and the ordinary app reopens the same entry
and returns to Today. Large/light, original scope and64 empty journals are restored.

All787 captured app/app-test/manual-test/project inputs match Linux and Mac.
Both scheme products pass actual signature, stable test-origin and push-disabled
checks. Strict source limits and touched Swift formatting pass. No expense,
Storage object or financial action is created by this account/read sequence;
all six complete hosted fingerprints remain exact. The temporary0600 credential
adapter is removed, with the original private fictional-login file retained.
[Native verification](partner-native-verification.json), [fingerprints](partner-fingerprints.json).
Source `8b5d6787` passes both required workflows: Nest37328777598 and
SwiftUI37328777652, with496 Foundation/41 explicit skips and419 signed-native/12
explicit skips, zero failures. Routine CI still skips the hosted/operator fixtures. This is one simulator and two real fictional
Supabase identities, not both phones or real Apple sign-in.

Earlier probes are retained honestly. Preparing two schemes into one derived
folder pruned the SDK test product, producing zero executed tests; separate build
folders correct that. The existing private fixture JSON initially lacked the
operator helper's actor/household fields; a private adapter supplies metadata
without weakening identity/origin checks. A direct SDK replacement while the
original app host remained active reopened Test Alex instead of Test Sam.
After adding direct Keychain checks immediately after sign-in and verification,
both SDK methods passed, but the runner incorrectly required an active SQLite
scope during a legitimate account transition. The scope observer now permits
that transition only between SDK and UI steps; fresh-launch partner and final
original-member identity/scope assertions remain strict. A new UI observer also
initially used “Profile” instead of its actual “Profile and preferences” label;
that nonmutating failure is corrected before the passing sequence.

The earlier active-host SDK replacement mismatch is **not claimed fixed**. Pinned
SDK reads perform storage migrations, and multiple clients were alive in that
probe, but no deterministic race diagnosis establishes the cause. The passing
sequence verifies normal native sign-out before each account switch, not an
arbitrary replacement beneath a running app. Preserve the stricter persistence
assertions; never resolve a future mismatch by dropping identity checks. A boolean
token comparison now avoids logging live credentials on assertion failure.
Full accessibility, live AI, physical account/receipt journeys and M1–M9 remain open.

A later [credential-ordering fix](../swiftui-auth-refresh-ordering/README.md)
reproduces and fixes two concrete late-refresh races through the shipping auth
boundary. That separate proof does not identify the precise cause of the earlier
multiple-client operator mismatch. Its newer source has its own verification/CI
checkpoint; the account/browser evidence above retains its original source scope.
