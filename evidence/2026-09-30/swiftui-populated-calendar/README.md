# SwiftUI populated EventKit QA — 30 September 2026

The owner's Mac was reachable. Actual Nest taps on the authorized clean iPhone 17 Pro simulator selected only a newly owned synthetic local calendar. The native screen showed its saved all-day and timed events, calendar name and fictional locations. The all-day label and 18:00–19:00 range were correct. At maximum Dynamic Type, scrolling exposed both rows and their complete metadata without horizontal clipping. This is bounded simulator evidence, not VoiceOver or phone acceptance.

The display choice remained selected on reopening the picker. Turning its actual switch back off restored the original empty selection. A fresh hosted sharing screen still reported **Busy sharing is off**; no Enable, Publish or financial command was pressed. Display selection does not enable sharing.

## Real SDK verification and cleanup

`apps/ios/AppTests/LocalCalendarFixtureTests.swift` belongs only to the native test target. Shipping Nest remains read-only with respect to EventKit. The helper requires all of:

- An explicit `NEST_TEST_CALENDAR_FIXTURE_ACTION=seed` or `cleanup` test environment.
- Simulator UUID `EE945B62-C56C-4AB9-A09E-C4B44F9CF03C`, the isolated test API origin and already-granted Full Calendar Access.
- A local EventKit source. Cleanup additionally requires the exact saved ID, unique fixture name and local source.

Seed creates its own uniquely named calendar and two clearly synthetic events. The actual `EventKitCalendarReader` reads both events from the store. Capture merges their blocking time to one full civil-day interval. The serialized projection is checked for exactly `covered` and `intervals`, each containing only numeric start/end bounds. No title, location, note, URL, calendar name or event identifier enters this projection. This verifies local capture and encoding; it does not prove network publication or partner visibility.

Initial real seed passed (0.126s). Initial cleanup passed (0.060s), but its UserDefaults marker survived process termination and blocked the next seed with `existingFixture`; that refusal created no additional calendar. The test harness now uses an atomic file instead. Two separate-process seed/cleanup cycles of the final source passed with zero failures/skips: 0.076/0.055s and 0.076/0.060s. Final cleanup verified the exact calendar and atomic marker absent. The obsolete initial UserDefaults marker is ignored by the final harness; it contains only a synthetic fixture identity.

Actual post-cleanup native taps verified no synthetic calendar in the picker, every display switch off and the explicit Choose calendars state. Existing calendars/events were neither enumerated for deletion nor altered. Full Access remains granted as authorized; light appearance and ordinary large text size are restored.

The Mac runner temporarily set the test-only scheme environment for each selected test, then restored the original scheme bytes in `finally`. Its SHA-256 is unchanged. Routine CI has no opt-in; these two tests skip honestly there and create no fixture. No new TestFlight build, deployment, provider request or production activity occurred.

## Identity and evidence

Shipping native Calendar source is unchanged from CI-verified `80474da1`; backend source remains `8fbe67d8` on the existing test alias. The new test source and all relevant native file hashes match between Linux and the Mac (see verification.json). Strict recursive Swift formatting, source limits and diff checks pass. New source needs its own CI; prior checks are not attributed to this increment.

- [Normal event rows](default.png)
- [Maximum-text all-day title](max-all-day.png)
- [Maximum-text all-day location](max-all-day-location.png)
- [Maximum-text timed metadata](max-timed.png)
- [Sharing stayed off](sharing-off.png)
- [Restored display state](restored.png)

Raw Xcode logs remain on the Mac under `/private/tmp/nest-populated-calendar-atomic-{0-seed,1-cleanup,2-seed,3-cleanup}-20260930.log`. Results are `Test-Nest-2026.09.30_{09-41-59,09-42-08,09-42-13,09-42-19}-+0200.xcresult` under `/tmp/nest-swiftui-planned-qa/Logs/Test/`. The initial logs preserve the failed UserDefaults-marker experiment rather than counting it as a pass.

Outstanding Calendar acceptance: actual sharing Enable/Publish, partner readback, real permission-loss handling, account-specific free/declined/cancelled/recurring events, household layers, VoiceOver and both phones. No milestone is marked complete by this evidence.
