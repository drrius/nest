# Authenticated chore flow

After verified Apple sign-in, “Open Today” opens `/household`, separate from the fictional design preview. It shows current due/overdue chores with Me + shared / Everyone, one-tap completion, pending feedback, refresh/retry and explicit conflict recovery. A virtualized native list supports larger snapshots. Chore dates retain the audited legacy `Europe/Zurich` household day, including DST; they do not follow a traveling phone's timezone.

`@nest/contracts/chores` shares Effect request/receipt schemas across API, native client and the existing AI tools. Each request obtains credentials for the expected actor; the API verifies current membership. SQLite commits the intent before visual/haptic feedback. Wire requests retain their operation IDs and dates after uncertain responses. Replay is serialized, handles compatible already-completed receipts honestly and refreshes the bounded authoritative snapshot afterward. One subtle selection haptic acknowledges durable local input, not a server success; its feel is unverified.

Known membership denial blocks further completion and retains pending work. A command-level denial only becomes an item conflict after a fresh authorized list succeeds; removed items cannot indefinitely block unrelated work. Conflict discard requires a native confirmation, removes only the failed local intent and dependents, and does not mutate the household record. Uncertain pending attempts cannot be discarded as confirmed rejections.

## Verification

- `pnpm test:chores`: 12 meaningful transport/file-backed SQLite/controller cases, including lost response + restart, conflict recovery, atomic snapshots, same-frame double taps, cancellation, actor mismatch and membership denial.
- `pnpm test:offline`: 13 existing journal regression cases.
- `pnpm --filter @nest/api test`: 24 HTTP/API/tool/Node adapter cases.
- `pnpm test:domain`: seven tests, including Zurich midnight/DST examples and 1,000 seeded date properties.
- See `tests/integration/README.md` at repository root for the targeted real Node HTTP → API → PostgREST → PostgreSQL + restarted SQLite proof.
- iOS Metro export succeeds. It is packaging evidence, not native execution.

## Outstanding native and offline gates

No iPhone has executed this flow. An isolated HTTPS API/backend, preserved Apple identity configuration and an installed development build are needed. After a cold restart, membership verification currently requires connectivity; fully offline cold-start access remains unimplemented. Once a session is verified, loaded chores can be queued through a connection loss, with foreground/manual retry. There is no background-sync or automatic-connectivity-recovery promise. Long-term queue/receipt retention limits remain to be implemented.

The Today screen covers chores only; meals, renewals, finance confirmations and real other tabs are not implemented by this slice. Routine editing/transfer/recurrence and grocery integration remain separate work. AI tools share the command, but live chat/provider streaming is still absent.

## Prepared device smoke — not executed

Use synthetic fixture data only. Sign in to the isolated household, open Today and verify Me + shared versus Everyone. Complete a known fixture chore; confirm its pending indicator, single subtle haptic and eventual removal after receipt. Disable connectivity, complete another loaded chore, kill/reopen the app, restore connectivity and sign in if needed; verify one server completion and no lost intent. Have the partner reschedule another queued chore; confirm the conflict requires review and that keeping the current chore sends no completion. Check logout/account isolation, large text, VoiceOver, light/dark and background/foreground. Record commit/build/device and backend fixture; a successful bundle cannot substitute for this evidence.
