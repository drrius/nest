# Calendar removal warning: rendered native verification

M1/M6 remain partial. Actual iPhone 17 Pro/iOS 26.3 simulator rendering reproduced the old full-screen maximum-text warning. The first compact implementation still covered the Today header because the native TabView did not reserve its outer inset. Source `be456dbb28ac982f308d4be332b36558f67f8281` uses a vertical container to reserve the warning's height and includes padding inside the button's hit shape.

The temporary, simulator-only fixture restored the existing fictional Test Alex SDK account against nest-test and intercepted only Calendar HTTP requests while an owned marker existed. All other APIs retained their normal adapters. This was controlled transport failure, not airplane mode or an EventKit permission revocation. The test did not enable consent or publish calendar data.

## Actual rendered checks

- Default and maximum Dynamic Type, light and dark: warning readable; Today date/header starts below it. The maximum-text warning is 190.67 points high; the default warning is 60 points high.
- Actual upper-right corner tap at (399, 65) opens Privacy. Done closes the sheet without clearing the pending removal.
- Maximum-text sheet scroll exposes the full Retry control (354 × 77.33 points). An actual retry with the Calendar fault retained keeps one scoped removal intent.
- Warning persists across Today, Meals, Calendar and Money.
- Removing only the owned Calendar fault marker and tapping Retry dismisses the sheet and warning. The scoped removal journal becomes empty through the application command, without direct journal deletion.
- Disabled server consent and its revision, plus the bounded financial balance/history API projection, remain unchanged. This is not a fresh complete ledger/storage reconciliation.

[Measurements and checks](verification.json) contain no tokens or financial rows. Screenshots show only fictional test household content:

| Observation                                     | Screenshot                                   |
| ----------------------------------------------- | -------------------------------------------- |
| Original maximum-text warning crowds the screen | [Before](before-max-light.png)               |
| First compact version still obscures Today      | [Overlapping inset](overlay-max-light.png)   |
| Corrected header placement, maximum text        | [Light](max-light.png), [dark](max-dark.png) |
| Corrected default layout                        | [Light](default-light.png)                   |
| Scrolled maximum-text explanation and Retry     | [Dark sheet](details-max-dark.png)           |
| Successful recovery removes the warning         | [Recovered](recovered-light.png)             |

## Cleanup and source identity

The original app root was restored to SHA256 `9f0cae72436f840d817443b7841e10c7932aaef98c13b3703dac7f7e8a3286b1`; `CalendarPrivacyVisualFixture.swift` was removed. All 784 tracked native files matched the Mac copy after synchronizing one README. The normal root was rebuilt/reinstalled and opened against the real test SDK session; reads succeeded with no pending warning. Actual simulator signing passes with push disabled. Simulator appearance/text size returned to light/large. No new beta, permission change, provider call, production mutation or merge occurred.

The first restored-root focused run passed 15 Calendar privacy/account/foreground tests but logged SQLite warnings: fixture files were unlinked while their stores were still open. Test cleanup now runs in XCTest teardown with only the path captured, after method locals are released. Follow-up source `c25b1321` passes 19 affected privacy/account/foreground/chore-refresh tests with zero failures or skips. Each of the three observed warning strings dropped from 14 occurrences to zero in the focused Xcode log; strict formatting and source limits pass. Normal-root screenshot: [restored app](normal-root-restored.png). Both exact-source CI workflows passed at `c25b1321`: [Nest36779598456](https://github.com/drrius/nest/actions/runs/36779598456) and [SwiftUI36779598321](https://github.com/drrius/nest/actions/runs/36779598321). Native CI executed 211 cases, four explicit opt-in skips and zero failures (207 passed), with strict formatting/source limits, Foundation rules, iPhone compilation/account tests and actual app signing. Documentation-only `950a8340` passed Nest36779932040.

## Remaining acceptance

Rendered account-change sheet dismissal, VoiceOver, Reduce Motion, the smallest supported device, actual airplane-mode/reconnection journeys and both physical phones remain outstanding. Build10 lacks this change. The visual fixture proves the application's pending/retry presentation with controlled failure; model/SQLite tests separately verify account fencing, exact replay and recovery semantics.
