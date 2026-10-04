# Meal Save dismisses the keyboard on failure

4 October 2026. The preceding [online-boundary check](../swiftui-meal-write-preflight/README.md) correctly refused a stale meal, but its maximum-text screenshot showed the keyboard covering the failure message. Accessibility reported that message as hittable; that did not establish visual readability. The earlier failed screenshot remains in that packet.

`MealAddSheet` now binds title focus, dismisses it before Save and supports interactive keyboard dismissal while scrolling. The typed draft remains in the sheet when the online command fails. No domain rule, command payload or retry identity changes.

The authorized Mac matched all1,039 [native/build-helper inputs](native-inputs.json), passed strict whole-tree Swift formatting/source limits, ran28 focused signed-native meal session/library tests with zero failures/skips, and verified the signed stable-test-origin binary. [Actual summaries](observed-verification.json) distinguish these native checks from hosted behavior.

On the owned SE3/iOS26.3 simulator, the largest-text/dark one-off form reviewed empty week41 and retained “Fictional boundary dinner.” One ordinary partner command added a different fictional meal, advancing only the hosted week to42. One44pt corner Save attempted the stale native draft. Its online check refused the change, leaving the cached week41 and all31 scoped command/decision slots plus seven meal journals empty. The keyboard disappeared without another tap. Scrolling to the bottom exposed the entire failure message; switching to ordinary text/light and scrolling back independently reread the exact typed title. No Save was repeated.

- [Keyboard before Save](keyboard-before-save.png)
- [Keyboard dismissed immediately after Save](after-save.png)
- [Full error at maximum text/dark](error-bottom-largest.png)
- [Preserved title reread](typed-title-after-refusal.png)
- [Ordinary text/light error](error-normal.png)
- [Actual form result and geometry](refused.json)

Independent reads by both fictional members confirm week42 contains only the partner fixture and all original groceries, complete52-event financial history and balances are unchanged. One ordinary remove command cleaned up only that fixture, leaving empty week43 and retained receipts. [Hosted reconciliation](hosted-reconciliation.json). The unsaved native draft was explicitly cancelled; the app then refreshed the cleaned week and returned to ordinary Today/default text/light, with stable test origins, signature, data/Keychain and empty journals preserved. [Restoration](restored.json). The first restoration wait incorrectly required the offscreen profile header after the sheet had already dismissed. Inspecting the real tab controls confirmed dismissal; scrolling the root to the top resumed restoration without repeating Cancel or Save. [Observer correction](restoration-observer-correction.json).

This closes this bounded simulator/hosted stale-placement and keyboard-failure check. It does not prove real radio loss, VoiceOver, every meal edit/approval/retry family or either physical phone. Live AI remains disabled pending Gateway eligibility. This change is newer than available TestFlight16; no new beta, merge, purchase or production mutation occurred. Both required workflows pass exact shipping source `6339a87a`: Nest37192247205/SwiftUI37192247221,490 Foundation tests with41 explicit skips and409 signed-native tests with11 explicit skips, zero failures. [Exact CI result](ci-status.json).
