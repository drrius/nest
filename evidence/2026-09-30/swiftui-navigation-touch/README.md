# Native Today touch and large-text verification

30 September 2026. Source `b61cc9dafc21db379ca2bda2f571101efa5636eb` on `codex/swiftui-navigation-touch`. Nine Swift files match the owner's Mac build byte for byte. No Expo/React Native client is involved.

## Change and native findings

The actual Profile accessibility target measured 26×25 points; several Today text links measured only 18–20 points despite their surrounding rows having a 44-point height. The interactive labels now contain a minimum 44-point height and explicit rectangular touch shape. Profile/Assistant icons also have explicit hit shapes, and the groceries/meal/bill rows include their empty space. Action text wraps with leading alignment.

At the largest accessibility text size, the date previously broke “Wednesday” and “September” around the header icons. A wider date row and a separate Today/actions row keep whole words readable. The native segmented filter remained 32 points tall and did not enlarge its labels. At accessibility sizes, the same two local choices become readable vertical buttons with visible checks and selected accessibility traits. Ordinary-size segmented navigation is retained. No command, authorization, financial or Calendar privacy logic changed.

## What ran

- Real signed iPhone17Pro/iOS26.3 simulator `EE945B62-C56C-4AB9-A09E-C4B44F9CF03C`, normal authenticated Test Alex app, existing test Supabase/API only. Installation preserved app data.
- Eight real corner navigation destinations: Profile, Household chores, Renewals, Meals, Calendar, Your approvals, Daily summary and Groceries. Coordinate taps used the empty right/top portion of the enlarged label. Profile was also checked at maximum text size. Meal navigation and maximum-text captures were repeated after the last wrapped-text alignment edit.
- Actual maximum-text scrolling reached both filter choices. Tapping Everyone moved the visible check; tapping Me + shared moved it back. Before/after header/filter and final ordinary light/dark captures were visually inspected. Labels fit horizontally in the tested viewport.
- Final native build, recursive strict Swift formatting, source/function/complexity limits, diff check and actual app signing passed. Push remains disabled. Mac log: `/private/tmp/nest-navigation-touch-final-build-20260930.log`.
- Fresh authorized read-only financial balance/history projections exactly match the earlier baseline: SHA256 `647a6641be579ffe113e28d406bb8bdc55288e8233fbfa14506a3afd921fc987`. This is the bounded API projection including 13 history entries, not a raw ledger audit.

## QA failures and test state

The first chore navigation assertion expected the wrong destination title. It was corrected to Household chores. A later corner check measured a row while asynchronous Today sections were still settling and missed its intended target. The exact test-environment journal audit found one pending completion for the existing fictional “Hosted smoke tidy kitchen” occurrence. That request was preserved, not deleted or treated as cancelled. After normal app restart, the real test API no longer included that original occurrence and the scoped journal was empty; the next recurring occurrence appeared. Financial projections remained identical. No production or personal data was involved. Subsequent coordinate checks require a stable target frame and fully exposed controls. An offscreen summary target also stopped the helper before tapping; scrolling exposed it and the repeated check passed.

The journal audit initially used uppercase keys and returned no rows; the store uses lowercase account keys. The corrected audit found the pending request and supplied the eventual empty-state evidence. Only the exact test-origin database fingerprint and fictional actor/household were inspected; the other environment database was untouched.

## Boundaries and remaining work

This is a bounded native rendering/navigation pass, not completion of M1 or full accessibility/phone acceptance. Empty due-bill links have source/build coverage only; no populated bill fixture was created. Retry buttons, other screens, smallest supported iPhone, full maximum-text scrolling, VoiceOver, real phone gestures and the pending Calendar removal banner still need checks. The incidental pending request motivates explicit enqueue-during-refresh and foreground/network replay verification; restart recovery alone does not prove those journeys. Native build10 lacks this change and the prior Calendar/expense follow-ups. No new beta, deployment, merge, provider/model call, purchase or automation occurred.

## Captures

- `header-max-before.png` / `header-max-after.png`: real maximum-text header before/after.
- `filter-max-before.png` / `filter-max-after.png` / `filter-everyone-max.png`: small old filter and both new selection states.
- `today-default.png` / `today-dark.png`: normal-size rendering. The dark capture includes the next recurring fictional chore after the completion described above; changing test data is not represented as an identical before/after content fixture.
