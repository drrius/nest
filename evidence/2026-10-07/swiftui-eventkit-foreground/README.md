# Real EventKit foreground refresh

One signed app-hosted test passes with zero failures, skips or runtime warnings
on a freshly created iPhone SE simulator. It uses the shipping EventKit reader,
CalendarModel and selection store with one synthetic local calendar/event.
It does not use a fake calendar reader or a hosted account.

The guarded test verifies full Calendar access and an empty current day before
creating its uniquely identified fixture. Nest reads the initial title/location
and selected calendar. Clearing visible details removes all event/calendar
presentation while preserving the opaque selection. A separate EKEventStore
then commits a changed title, location and time. After a bounded EventKit change
notification, presentation remains empty until explicit refresh. Refresh reads
the exact changed title/location/time and keeps the selected calendar.

Cleanup removes only the identified owned calendar and isolated preferences.
The controller deletes the fresh simulator even on failure. No original simulator,
phone, real calendar account, household record, credential or production system
is used. Initial OS permission is granted through simctl, bypassing the prompt.

[Native result](foreground-summary.json), [single invocation](results.json),
[owned cleanup](cleanup.json) and [executed source hashes](source-hashes.json)
retain the proof. All four executed hashes match the local source. The test is
`EventKitForegroundRefreshTests/testForegroundRefreshReadsExternalEventChangeAfterClearingPrivateDetails`.

Run only on a fresh empty simulator. Set its exact UUID in
`NEST_QA_EVENTKIT_SIMULATOR`, `NEST_QA_EVENTKIT_CREATED=20261007-empty-no-account`
and `NEST_QA_EVENTKIT_PHASE=foreground` in the xctestrun environment. Original
simulators and physical phones are explicitly refused. Full access must be
pre-granted for the owned test host; ordinary CI intentionally skips this case.

This complements the [controlled-reader model check](../swiftui-calendar-foreground/README.md).
It calls the model lifecycle directly; it does not background the rendered app
or prove scene-hook execution, Apple-account sync, initial permissions, live busy
sharing or physical-phone behavior. Those M6 acceptance requirements remain open.
No shipping source is changed and build 23 remains available unchanged. This
fixture needs CI compilation after push, not another beta build.
