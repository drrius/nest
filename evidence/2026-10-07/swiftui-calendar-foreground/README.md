# Calendar foreground refresh

The focused signed app-hosted test
`CalendarModelTests/testBackgroundClearingPreservesSelectionAndForegroundReadsChangedLocalEvents`
passes once on a fresh iPhone SE simulator, with zero failures, skips or runtime
warnings. It uses a controlled device reader and isolated UserDefaults, not live
EventKit data or hosted accounts.

The test reads a selected event, clears visible event/calendar details, verifies
that the opaque calendar selection remains persisted, changes the reader's local
event, then refreshes. The updated event appears after a new device read, the
selection remains, and no permission request occurs. This verifies the native
model behavior used when entering and leaving the foreground.

Source inspection confirms CalendarScreen refreshes on active scene phase and
clears visible details otherwise. TodayCalendarSection also gates reads on active
phase and visible/current membership, clearing details when inactive or hidden.
The test does not execute those rendered lifecycle hooks; actual backgrounding,
real-calendar changes, offline radios and physical-phone acceptance remain open.
No shipping source, provider call, hosted data, permission or release changes.

[Native result](summary.json), [owned simulator deletion](cleanup.json) and
[source hashes](source.json) retain the bounded evidence. Original simulators are
untouched. Build 23 remains the phone candidate; this test needs no beta rebuild.
