# Smallest-screen SwiftUI pass

M1/M5 remain partial. A new Nest-only iPhone SE (3rd generation)/iOS 26.3 simulator provides the 375 × 667-point layout. It starts without an Apple account, imported calendar data or another app session. The existing operator fixture uses real Supabase SDK authentication and test membership, restricted to the two explicitly owned simulator IDs, exact nest-test origins and push disabled. Its one hosted session/persistence test passes. The private credential sidecar is removed and the original scheme restored afterward. This is fictional SDK setup, not Apple sign-in acceptance.

Source `83f6010dd09c0299c7ac3c3a5c8c0d884d2d720d` fixes actual maximum-text defects: the fixed-width empty meal slot label broke Breakfast into fragments, and the populated row's side-by-side detail/options controls compressed recipe names. Accessibility sizes now stack slot/action and detail/options vertically. The Add sheet uses native inline source choices at accessibility sizes and preserves the segmented control otherwise. Its target date is readable and its header occupies the available width. Commands, validation, approvals and save behavior are unchanged.

## Rendered behavior

Actual normal-root SDK entry displays optional first use; Get started opens Today. All four tabs display real test data or honest Calendar permission guidance. Captured default/max text in both appearances keeps native tab navigation available. Final meal rows and Add sheet have light/dark maximum-text and default-light checks.

Actual taps open Monday breakfast Add and Cancel, real planned recipe details and Back, and the native meal options popup. The popup is an accessibility `PopUpButton`, not the Button type assumed by the initial QA helper; selecting it through its real name exposes all four existing actions. None of those mutations was executed.

One-off/Saved meal selection switches correctly; the saved source displays the actual Synthetic lentil bowl library item. Save stays disabled without valid title/recipe selection. Cancel returns safely. The selected real planned soup lacks retained ingredient details, and its detail screen explains that limitation; this does not prove a retained-recipe journey.

## Data and cleanup

Read-only checks before and after the final selection tests show the same selected meal-week hash, unchanged disabled Calendar consent/revision and unchanged bounded financial balance/history projection. All six inspected scoped meal command journals and the Calendar removal journal are empty. No journal was deleted directly. The week hash is `915b258770d78b112d566bcd396189b6e739a09da81e172f38b712c8473fbbd5`; it is not a complete migration reconciliation.

All 784 tracked native files match the Mac copy, the ordinary app root is retained, no temporary visual fixture exists, and strict formatting, source limits, native compilation and actual signed-app push-disabled checks pass. Appearance/text size return to light/large and the ordinary Today tab. The integrated migration source manifest gate and its four focused integrity tests also pass. [Verification metadata](verification.json) contains no credentials or financial rows.

## Screenshots

| Observation                        | Evidence                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| Real first use and Today           | [First use](onboarding.png), [Today](today.png)                                       |
| Honest permission and real balance | [Calendar](calendar.png), [Money](money.png)                                          |
| Maximum-text meal rows             | [Before](meal-row-before.png), [after](meal-row-after.png), [dark](meal-row-dark.png) |
| Default meal layout                | [Meals](meals-default.png)                                                            |
| Maximum-text source choices/date   | [Before](source-before.png), [after](source-after.png), [dark](source-dark.png)       |
| Actual saved source                | [Saved meal](saved-source.png)                                                        |

Nest36782560633 passes at source `83f6010d`; SwiftUI36782560751 remains pending. Prior fixture/integration source `fd0304ef` passed both workflows (Nest36780899428, SwiftUI36780899364). Current-head CI is required before delivery. Earlier Calendar source `c25b1321` separately passed both workflows, including 211 native cases with four explicit skips and zero failures.

## Remaining acceptance

This selected pass does not cover every form, populated/error state, full weekly journey, actual offline retry, VoiceOver, Reduce Motion, both physical phones or owner design acceptance. No meal was saved in this increment, so its UI evidence does not replace the existing command/database tests. The Calendar removal warning has 17 Pro controlled-failure evidence; the pending warning has not yet been rendered on this SE. Build10 lacks these corrections. No new beta, production mutation, provider call, purchase or main/PR merge occurred.
