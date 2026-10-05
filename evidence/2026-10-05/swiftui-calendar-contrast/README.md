# Calendar contrast diagnostics — 5 October 2026

The original native client remains unchanged. Two proposed visual changes failed
actual simulator checks and were removed: hiding the bottom scroll-edge effect
and using darker Quiet ink on the refresh control. Neither is presented as a fix.

The signed SE3/iOS26.3.1 app uses the real separate nest-test API, preserved member
Keychain session, unrequested Calendar permission and unknown partner availability.
The manual UI suite does not fake authentication or API responses. No Calendar
permission, household command, financial posting, live model call, beta, purchase,
production action or merge occurred.

## Actual results

- Original initial Calendar audit: seven reports. Bottom-edge-hidden experiment:
  eight reports, none suppressed. This result does not justify hiding the effect.
- After removing that experiment, native permission reading passes again. All64
  command slots remain empty and original large/light settings are restored.
- A new diagnostic reveals the complete unknown-availability paragraph above the
  native tab bar before asking Apple to audit the viewport's contrast.
- Its initial observer stopped at the first failure and the attached element crop
  identifies Refresh busy times. This was not an exhaustive finding count.
- Darker refresh ink also fails that check; it is removed. No color fix is claimed.
- The final observer shares the root suite's diagnostic handler, records every
  finding, returns false for every issue and allows all findings to be reported.
  It fails with three reports: Refresh busy times, Calendars and layers, and Busy
  sharing. The latter two bounds are under the tab bar; the refresh bounds are
  above it. The unknown paragraph occupies426.5–521pt; the bar begins584pt.

The final run records641 matching compiled app/manual-test/project inputs, actual
signature verification, stable test origins and disabled push. Its deferred native
Today selection assertion and restored large/light settings pass, with64 empty
command slots before and after. The runner's completion is not an audit pass:
Xcode's test exit is65 and all three contrast failures remain open.

The [reviewed screenshot](revealed-calendar.png) contains only public permission
copy, unknown availability and controls. Raw result bundles and other attachments
remain local. This narrows the reproduction; it does not establish the cause,
dismiss Apple's findings, approve the full audit, or prove VoiceOver/phone behavior.
The earlier full five-test suite's20 unsuppressed reports remain unresolved.

## CI boundary

The preceding PDF source b48e6160 passes both required workflows:
[Nest37313762429](https://github.com/drrius/nest/actions/runs/37313762429) and
[SwiftUI37313762258](https://github.com/drrius/nest/actions/runs/37313762258).
Routine CI formats/limits manual UI sources but does not execute these live-session
diagnostics. Current diagnostic-source CI will be recorded separately; a green
routine workflow cannot clear this failing accessibility gate.

## Explicit tab-bar background experiment

An additional actual native experiment requests the Quiet background and visible
tab-bar background through Apple's public SwiftUI modifiers. It still fails with
the same three findings: Refresh busy times, Calendars and layers, and Busy sharing.
The latter two are beneath the bar; the refresh row ends at573pt, above its584pt
top. Nothing is suppressed. This does not establish the cause or justify retaining
the visual change, so both modifiers are removed from Linux and the Mac.

The restored source passes the actual permission-reading method and ordinary
history/detail/Today navigation, with zero failures or skips. All790 compiled
inputs match; signatures, separate test origins, disabled push, original fictional
actor/household, large/light settings and64 empty journals are verified.
All six complete finance/activity/Storage fingerprints remain unchanged.
[Diagnostic and restoration](opaque-tab-bar-diagnostic.json),
[retained fingerprints](opaque-tab-bar-fingerprints.json).
The original20-report full audit, VoiceOver and both-phone acceptance remain open.
No shipping UI change, model call, financial posting, Calendar grant, beta,
production change or merge occurred.
