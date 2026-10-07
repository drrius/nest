# Actual EventKit permission revocation

Two signed app-hosted checks pass with zero failures or skips on a fresh owned
iPhone SE simulator running iOS 26.3.1. These use the actual EventKit reader and
Calendar model, rather than a fake permission reader.

With OS calendar permission granted, the test verifies there are no events in the
current day, creates one synthetic local event and selects its calendar through
Nest. The selection and fixture marker are saved. OS permission is then revoked
with simctl, and a separate test-host launch verifies denied access, removal of
persisted display selections, no visible calendar/event details, refused event
reads and unknown busy availability.

The first attempt passed the granted phase but failed when the second launch
could not find its marker. The test now explicitly flushes its preferences before
the external permission change. Both final phases pass. This changes fixture
transport only; no shipping Calendar behavior is changed. The initial failure
and both simulator cleanups are retained. The available evidence does not prove
all causes of the initial persistence failure.

[Final native results](final/results.json), [source hashes](final/source-hashes.json),
[cleanup](final/cleanup.json). The reported XCTest container IDs change between
launches; the second test explicitly verifies retained selection before clearing
it. External preference snapshots are diagnostics, not stronger evidence than
that executed assertion. Neither phase may run on the original simulators or
physical devices; ordinary CI skips them unless the owned fixture guards are set.

Both owned simulators are deleted. No hosted session, household data, production
system, original simulator, real calendar account or phone is used. The system
permission grant bypasses the initial prompt, so this is revocation/restart proof,
not permission-onboarding, rendered UI, live busy-sharing or device acceptance.
Build 22 remains unchanged.

The executed source is apps/ios/AppTests/EventKitPermissionRevocationTests.swift.
Run its two methods separately on one freshly created empty simulator. Set
NEST_QA_EVENTKIT_SIMULATOR to its exact UUID, NEST_QA_EVENTKIT_CREATED to
20261007-empty-no-account, and NEST_QA_EVENTKIT_PHASE to allowed or denied in the
xctestrun environment. Grant calendar access for ch.drrius.nest before the first
method and revoke it before the second. Delete only that owned simulator after
both phases, including on failure. Do not re-seed a failed fixture.
