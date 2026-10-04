# Native preference saves, interrupted recovery and stale-form refusal

The actual signed SwiftUI client and separate nest-test API pass these normal-text/keyboard journeys on the owned iPhoneSE3/iOS26.3 simulator:

- Save a fictional private calorie goal. Drop the committed reply, restart, retain the exact pending command, then explicitly retry the same operation. The immutable receipt/revision is unchanged; there is one applied change. A fresh native Save restores the original food preferences.
- Repeat committed-reply loss/restart/exact retry for shared cooking notes. Both members see the canonical shared values. All four native Save actions succeed at the44pt control’s corner, including with the keyboard open.
- With an unsaved native edit still open, the partner makes one authorized cooking update. The stale Save refuses before journal staging or POST and retains typed notes. Explicit reload confirmation then shows the partner’s current notes; a fresh native Save restores the original shared preferences.

There are four distinct native commands, two exact replays and one separate partner command: food revision3→5 and cooking3→6. Goal/notes/slots/restrictions/dislikes/portions are restored; receipts/revision history are preserved. Both independent setup states and complete52-event financial reads/balances remain unchanged at all recorded checkpoints. A populated-goal RLS positive control returns1600 to its owner and zero rows to partner/outsider, using only ordinary tokens and a publishable key.

The reload observer first selected a control reported hittable behind the keyboard. It typed an extra local space instead of opening the dialog; no write occurred. Two attempted pan gestures were rejected for leaving the reduced keyboard viewport and did not execute. The control was then pressed above the keyboard and its real confirmation explicitly completed. The earlier stale-refusal snapshot remains the evidence for exact retained input; the corrected confirmation/result is separately recorded. Save was not repeated.

All1,037 inputs match shipping native source at `8a35603e`, unchanged from the [CI-verified control correction](../swiftui-preferences-review/README.md). Exact native CI37180607659 passes490 Foundation/41 explicit skips and403 signed-native/11 skips, zero failures; documentation checkpoint8a also passes routine37181034051. This pass adds real native/hosted evidence, not new shipping code or another full native test run.

Stable test origins/ordinary Today are restored;31 scoped command/decision slots are empty through normal acknowledgement, with no deletion of unresolved work. Keychain/data are preserved, the owned relay is stopped and its generated key destroyed. Only explicit nonsecret fictional evidence files were exported.

This is bounded normal-text simulator/hosted verification. Largest-text save/recovery, VoiceOver, populated B food forms, broader onboarding/private settings, live AI tools and both phones remain open. M3 is not fully accepted. No production access, purchase, merge, new cloud build or TestFlight upload occurred.
