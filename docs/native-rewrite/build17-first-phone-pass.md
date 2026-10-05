# Build 17 first phone pass

Private candidate: SwiftUI **0.1.0/build17**, separate **nest-test** environment. Apple reports 17 VALID/IN_BETA_TESTING internally and unexpired. [Release evidence](../../evidence/2026-10-05/swiftui-build17/README.md). Particular partner access and installation remain unverified; confirm the build number in TestFlight.

This batch improves keyboard and large-text controls in meals, preferences, private memory and the assistant, financial review/cancellation controls, and chore conflict recovery. It retains build16's saved Money/history/detail and recipe reads. Live AI, scheduled bill posting/reminders and push delivery remain inactive while their integration gates are open. Production data is separate.

Before updating, reconnect and finish or reconcile pending actions. Do not delete the app or unresolved saved requests.

Both partners should try these independently:

1. Install build17 and sign in. Check your own profile and household, then open Today, Meals, Calendar and Money. Report anything that looks wrong or feels awkward.
2. Open the private assistant. Type several paragraphs with the keyboard open, including at your preferred larger text size. The final line and Send must stay reachable. Live AI is still unavailable; do not treat a failed response as a working integration.
3. Open cooking preferences and edit notes with the keyboard open. The final line and Save should remain reachable. Cancel if you do not want to change your household preferences.
4. Review a financial form with the keyboard open. Cancel its review and confirm no entry was saved. Repeat with larger text; review and cancellation controls should remain readable and reachable.
5. After loading a Money entry and saved recipe online, disconnect and reopen them. Saved information should be clearly identified; new money actions should require a connection.
6. Reconnect, check a grocery or complete a chore, and confirm the change for your partner. Use nest-test only.

Report the build number, screen/action, expected result and actual result. Only journeys you actually perform establish phone evidence. Continue with the [full phone checklist](swiftui-phone-acceptance.md); calendar privacy, AI approvals, notifications, accessibility and broader offline conflicts retain their separate acceptance gates.
