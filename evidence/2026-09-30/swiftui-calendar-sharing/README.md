# Native busy-sharing verification — 30 September 2026

Actual normal-app taps on the authorized clean iPhone 17 Pro simulator enabled Test Alex’s busy sharing, selected only the uniquely owned synthetic local calendar, and published through the existing authenticated API. Birthdays, Calendar and US Holidays stayed unselected. Separate real authenticated reads for Test Alex and Test Sam returned the same numeric-only snapshot; the outsider returned HTTP403. Exact snapshot/interval keys were checked: no event title, location, note, calendar name or local identifier was uploaded.

The corrected snapshot covers 28 civil days (673 hours across Zurich’s autumn transition), with one full-day busy interval of exactly 24 hours. The ordinary Calendar screen, authenticated as fictional Test Sam through the pinned Auth SDK fixture, rendered **Busy / All day** without personal event metadata. This is the same simulator changing fictional sessions, not two phones or Apple sign-in. Test Sam’s Get started tap created only a member-local quick-start marker. Test Alex’s original SDK session was restored and verified before permission QA.

## Bug found and corrected

Initial publication exposed two issues hidden by the earlier clipped one-day projection test. The fixture’s next-midnight end produced a two-day all-day EventKit event. The mapper also treated the SDK’s observed inclusive 23:59:59 end as exclusive, leaving the final second free. Corrected seeding uses the last second of the intended civil day and asserts the actual saved start/end. A full 28-day capture now proves there is only one intended busy day. The shipping mapper converts inclusive all-day ends to exclusive civil-day boundaries while preserving timed rounding and rejecting malformed dates. The inclusive-end behavior is an observation of the real pinned SDK/runtime, not a claim derived from documentation.

Three core cases exercise 1,600 generated inclusive/exclusive boundary combinations across Zurich, New York, Apia and UTC, including last-millisecond/next-day availability. Explicit Zurich 23/25-hour DST and 71-hour multi-day spans and malformed/timed input checks pass. Final focused core regression: **10 tests, 0 failures, 0 skips, 0.054s**. Existing real EventKit mapping regressions: **2 tests, 0 failures, 0 skips, 0.037s; Xcode TEST SUCCEEDED**.

Corrected actual SDK fixture cleanup/seed passed separately (0.064/0.079s); final cleanup passed (0.055s), all without skips. Real pinned Auth SDK partner setup/member restoration passed separately (1.508/1.335s). Those explicit fixtures are simulator/test-origin/fixed-fictional-identity guarded and skip in ordinary CI. They do not establish shipping account-switch/logout or Apple-auth acceptance. No credentials or test activation are committed.

## Actual permission-loss cleanup

After restoring Test Alex, a fresh normal-app publish was followed by actual `simctl privacy revoke calendar ch.drrius.nest`. Reopening the normal sharing screen disabled consent and removed the snapshot from both fictional members’ reads at **09:07:36 UTC**, before its **09:18:31 UTC** expiry. The native screen showed Calendar access off and sharing turned off. The retained numeric [readback](permission-loss.json) identifies the actual final snapshot as generation **13**, consent version **7**, followed by disabled version **8**. This proves online cleanup when the sharing screen opens after denial; app-wide detection outside that screen, offline cleanup and pending-enable/conflict/restart races remain unfinished.

Two earlier preconditions stopped honestly before revocation: one snapshot had expired; a later standalone operator read token had expired. The normal SDK publish had succeeded. The audited fictional refresh helper renewed only fixture tokens, and the successful run used a still-live snapshot. These stopped checks are not counted as permission-loss passes.

Full Access was restored through the actual OS prompt under existing explicit owner approval. Final cleanup removed only the exact owned calendar and atomic marker and restored empty display/sharing selections. Temporary credential copies and the temporary partner read token were removed. Existing calendars and real accounts were not modified. Consent/journal history is retained, with final sharing off. Balance and all 13 financial history API summaries exactly match the pre-test projection (SHA256 `647a6641be579ffe113e28d406bb8bdc55288e8233fbfa14506a3afd921fc987`); this is a bounded API fingerprint, not a full raw-ledger SQL audit.

## Source and limits

Linux/Mac hashes match for all five changed Swift files and the unchanged scheme. Strict recursive Swift formatting, source limits, diff checks and actual signed simulator push-disabled configuration pass. Backend/schema remain `8fbe67d8`; no deployment or migration occurred. Exact source needs fresh CI; prior `71b77591` passed both workflows (36685659228 / 36685659213). Current fix is absent from the internally available TestFlight build10. No new build, merge, purchase, AI/provider request, production write or automation occurred.

- [Only the owned calendar selected](synthetic-selection.png)
- [Normal publish receipt](publish-receipt.png)
- [Partner’s time-only Calendar row](partner-all-day.png)
- [Actual denial turns sharing off](permission-loss-off.png)

Mac logs are `/private/tmp/nest-calendar-busy-focused-final-20260930.log`, `/private/tmp/nest-calendar-eventkit-regression-20260930.log`, `/private/tmp/nest-calendar-all-day-{0-cleanup,1-seed}-20260930.log`, `/private/tmp/nest-calendar-{partner-session,member-restored,sharing-final-cleanup}-20260930.log`. The final real cleanup xcresult is `Test-Nest-2026.09.30_11-13-56-+0200.xcresult` under `/private/tmp/nest-swiftui-planned-qa/Logs/Test/`.

M6 remains incomplete: global/offline permission-loss recovery, pending races, populated account-specific recurring/free/declined/cancelled calendars, household layers, VoiceOver and both phones need verification or implementation. No milestone is marked complete.
