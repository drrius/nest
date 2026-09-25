# Authenticated chore flow

After verified Apple sign-in, “Open Today” opens `/household`, separate from the fictional design preview. It shows current due/overdue chores with Me + shared / Everyone, one-tap completion, pending feedback, refresh/retry and explicit conflict recovery. A virtualized native list supports larger snapshots. Chore dates retain the audited legacy `Europe/Zurich` household day, including DST; they do not follow a traveling phone's timezone.

`@nest/contracts/chores` shares Effect request/receipt schemas across API, native client and the existing AI tools. Each request obtains credentials for the expected actor; the API verifies current membership. SQLite commits the intent before visual/haptic feedback. Wire requests retain their operation IDs and dates after uncertain responses. Replay is serialized, handles compatible already-completed receipts honestly and refreshes the bounded authoritative snapshot afterward. One subtle selection haptic acknowledges durable local input, not a server success; its feel is unverified.

Known membership denial blocks further completion and retains pending work. A command-level denial only becomes an item conflict after a fresh authorized list succeeds; removed items cannot indefinitely block unrelated work. Conflict discard requires a native confirmation, removes only the failed local intent and dependents, and does not mutate the household record. Uncertain pending attempts cannot be discarded as confirmed rejections.

## Verification

Focused tests cover the shared runtime through file-backed Node SQLite, actual API/PostgREST/PostgreSQL requests, lost acknowledgments, restart, account isolation, conflicts, prepared legacy callers and cutover epochs. See the current [progress checklist](../../../../docs/progress.md) for exact commit/CI evidence and [integration guide](../../../../tests/integration/README.md) for reproduction. Test counts in earlier slice notes are historical; packaging and typechecking do not establish native execution.

## Implemented behavior and remaining native gates

Protected same-member identity recovery supports previously verified cold starts during an outage. Definitive sign-out, membership denial and account changes invalidate the fallback. Account-level foreground/reconnect handling attempts replay through the current authorized clients; no continuous background-sync behavior is promised. Queue capacity and receipt retention are implemented without deleting unresolved intent; see the [offline journal contract](../offline/README.md).

Today also composes meals, renewals, calendar, variable bills and financial confirmations. Routine editing, recurrence, handovers and groceries have separate native/API/shared-command implementations. Private chat streaming and journaled AI tools are implemented. Source availability is not live provider or device acceptance.

No iPhone journey has executed here. An approved isolated HTTPS API/backend, preserved Apple identity configuration and signed development build are still needed. Actual Keychain/Expo SQLite behavior, reconnect after process death, haptics, accessibility and both-member use remain unverified.

## Prepared device smoke — not executed

Use synthetic fixture data only. Sign in to the isolated household, open Today and verify Me + shared versus Everyone. Complete a known fixture chore; confirm its pending indicator, single subtle haptic and eventual removal after receipt. Disable connectivity, complete another loaded chore, kill/reopen the app, restore connectivity and sign in if needed; verify one server completion and no lost intent. Have the partner reschedule another queued chore; confirm the conflict requires review and that keeping the current chore sends no completion. Check logout/account isolation, large text, VoiceOver, light/dark and background/foreground. Record commit/build/device and backend fixture; a successful bundle cannot substitute for this evidence.

Requests bind to both expected household and actor, with current server membership checks. A known denial remains blocked through subsequent network errors. Offline intent carries its originally observed epoch; exact recorded receipts remain recoverable after cutover, while unreceived stale intent requires explicit conflict review.
