# Today filled Add action

Today's filled Add label now uses QuietPalette.onAccent, matching Meals and Money
filled actions. The previous surface token already had adequate calculated contrast;
this is semantic styling consistency, not a fix for the failing under-tab-bar audits.

Two actual signed SwiftUI read-only methods pass at normal text, light and dark,
zero failures/skips. Each requires the real signed-in fictional member, checks the
Add button is hittable, at least44pt high and above the tab bar, opens the native
Chore/Grocery/Expense menu, then dismisses it without invoking an action.
[Results](results.json). Both [light](light.png) and [dark](dark.png) screenshots
are inspected. The calculated palette ratios are supporting evidence only; this
test does not run Apple's accessibility audit or prove VoiceOver/Reduce Motion.

Original actors/household,64 empty journals per client, display settings and local
privacy choices restore. [Restoration](restoration.json). Signed preparation and
source limits pass. Current-source CI and physical-phone acceptance remain open.
No hosted command, financial posting, live model call, permission change or beta
submission occurs. This shipping change is after build21.
