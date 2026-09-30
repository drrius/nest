# SwiftUI first use and optional setup

Captured on 30 September 2026 using the normal Nest app, bundle `ch.drrius.nest`, on the dedicated iPhone 17 Pro/iOS 26.3 simulator `EE945B62-C56C-4AB9-A09E-C4B44F9CF03C`. Public configuration points only to the isolated test API and Supabase project `tkjixmujjoustdiedfmw`; the authenticated account is fictional `Test Alex`. No temporary root or fixture-only UI route was used.

## Observed native behavior

- The first-use sheet offers **Get started** and **Set up everything**, explains independent personal setup and requests no permissions on entry.
- Comprehensive setup reads saved food, shared cooking and personal notification facts. Calendar access/busy sharing remain separately chosen on this iPhone.
- Opening food preferences uses the existing real editable form. Returning refreshes the checklist; no Save was pressed.
- The checklist's Get started returns to Today. A cold relaunch does not repeat first use.
- To exercise quick start, only the fictional member's exact `nest.first-use.v1` defaults key was removed after checking the test configuration and existing comprehensive value. All other defaults were compared unchanged; credentials and offline storage were preserved.
- At maximum Dynamic Type, scrolling reaches both first-use buttons and **Get started** works. The original `large` setting was restored.
- Quick choice also survives cold launch. Profile → Your setup reopens the checklist.

Screenshots: [first use](first-use.png), [saved checklist](setup.png), [maximum text top](first-use-largest-top.png), [maximum text controls](first-use-largest-controls.png). Enlarged content requires scrolling; the navigation bar remains native.

## Verification

- Seven core cases: strict setup contracts/ownership, all configured-flag combinations, environment/member/household choice isolation, reopened/corrupt local metadata, read-only request and exact successful assistant destinations. Mac log `/private/tmp/nest-swift-setup-final-core-20260930.log`; no failures/skips.
- Four signed native model cases: independent quick/comprehensive metadata; failed refresh clears facts; delayed logout/partner/fresh-session results cannot publish or save a choice; unavailable metadata storage allows explicit continuation. Log `/private/tmp/nest-swift-setup-fallback-native-20260930.log`, 0.298 seconds, no failures/skips; result bundle `Test-Nest-2026.09.30_02-55-50-+0200.xcresult` under the dedicated DerivedData logs.
- Three existing backend cases passed in `/tmp/nest-setup-existing-services-20260930.log`, including real authenticated handoff HTTP and read failure behavior. No backend source change.
- Real hosted GET verification matches setup facts against all three profiles and denies an outsider. Before and after native navigation/skipping, a protected local SHA256 baseline compares complete profile envelopes, including revisions. Both runs pass without skips (7.027/6.727 seconds): `/private/tmp/nest-swift-setup-before-20260930.log`, `/private/tmp/nest-swift-setup-after-20260930.log`. Raw profiles/tokens are not included here. No hosted write was issued.
- Strict Swift formatting, source limits, diff checks and signed simulator build pass. Final build log `/private/tmp/nest-swift-setup-copy-build-20260930.log`.

These checks do not establish physical-phone, VoiceOver, both-member form-save, missing-profile native rendering, every progressive-feature entry or live assistant execution. No APNs enrollment, calendar permission, provider spend, production change or release occurred. Current-head CI is recorded separately in `docs/progress.md`.
