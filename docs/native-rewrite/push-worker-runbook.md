# Push worker activation and acceptance

The worker source is available at `apps/api/push-worker.mjs`. It is disabled unless `NEST_PUSH_WORKER_ENABLED=true`. Source merges do not install a schedule, apply migrations or start this process.

Use an isolated development backend first, with separately approved additive migrations. Required server-only configuration:

- `NEST_SUPABASE_URL` and `NEST_SUPABASE_PUBLISHABLE_KEY` identify the backend.
- `NEST_SUPABASE_PUSH_SECRET` is a Supabase server secret, never a mobile environment variable.
- `NEST_PUSH_SCHEDULER_TOKEN` is a separate random 32-byte hexadecimal secret.
- `NEST_APNS_ENVIRONMENT` must explicitly be `sandbox` or `production`, matching the signed app's entitlement. TestFlight uses Apple's production APNs environment even when Nest's backend is the isolated test project.
- `NEST_APNS_KEY_ID`, `NEST_APNS_TEAM_ID` and `NEST_APNS_PRIVATE_KEY` are the Apple provider credentials. The private key must be a P-256 PEM signing key and stays server-only. A missing or invalid key stops startup before listening.
- `NEST_PUSH_PORT` defaults to 8789. The server binds to loopback only.

After configuration and explicit activation, `node apps/api/push-worker.mjs` starts the dedicated APNs process. An authenticated empty-body `POST /internal/push/run` performs one bounded maintenance/delivery cycle for renewals, chores, meals, groceries, recurring expenses and daily summaries. Each source has its own durable page checkpoint; summaries scan only the current Zurich day. Each invocation visits at most 250 summary preferences and 100 summary/device pairs, with at most four concurrent sends per page. A source maintenance failure skips that source’s new sends while the other sources can still proceed. Use the scheduler token as a Bearer credential. Keep credentials out of command history and logs. Hosting must provide a private authenticated route to the loopback process and schedule repeat invocations; no hosting or scheduler is configured by this change.

Responses contain aggregate counts/status only, including separate summary, chore, meal, grocery and recurring maintenance/delivery statuses. `processed` includes attempts for all six sources; `complete` requires all six scan pages to complete. A 200 means the bounded invocation finished without runner failures, not that any notification appeared on a phone. APNs acceptance is stored as `provider_accepted`; APNs has no phone-delivery receipt API, so this process reports `receipts=not_applicable` and `polled=0`. It never claims legacy Expo receipt tickets. `complete=false` requires another invocation. A 503 means some work failed or exceeded its deadline; a later invocation resumes durable state. Never reset sending/unknown attempts to ready manually: uncertain external sends cannot safely be repeated. Retained legacy Expo adapters/tests still support their separate receipt semantics; they are not the Swift client's runtime.

Before hosted activation, verify the actual Auth session schema and migrations in the isolated backend, signed APNs environment and Apple credentials, explicit device enrollment, mute/revocation behavior, immutable provider outcomes and notification opening from foreground/background/cold start. Verify that scheduling fits the approved hosting and monthly budget. Production migration, purchases and release publication require separate owner approval.

The three Auth session column assumptions are now confirmed by a read-only
nest-test catalog query on 7 October: non-null UUID `id`/`user_id` and nullable
`timestamptz` `not_after`, with query-role SELECT privileges. No session or token
rows are read. [Metadata evidence](../../evidence/2026-10-07/hosted-test-push-session-schema/README.md).
This verifies column shape, not complete Auth policies, refresh/expiry behavior
or actual delivery. Server credentials/APNs configuration and activation remain open.

Current evidence: disposable PostgreSQL, real local HTTP/PostgREST and loopback HTTP/2 acceptance for all six APNs sources; lost checkpoint acknowledgements recover without duplicate sends. Legacy Expo compatibility regressions also pass. Native enrollment controls/logout and warm/cold notification opening have focused simulator evidence. On 30 September the hash-checked APNs registration/outcome migrations and journal-barrier repair were installed on nest-test after full-chain rehearsal; a real Swift/API registration/replay/cancellation/disable fixture passes with no active token or provider attempt remaining. See [hosted installation](nest-test-setup.md). No worker/scheduler is configured there, and delivery remains default-disabled. Real Apple delivery, hardware permissions/token callbacks and two-phone notification navigation are not accepted yet.

Chore maintenance visits up to 250 reminder settings in each of two fixed UTC-day windows, then up to 500 pending rows for invalidation. Its delivery scan visits at most 100 raw outbox/device pairs per invocation, using an independent compare-and-swap checkpoint. Invalid sessions still advance the cursor. A completed page wraps so later edits and new registrations are revisited. The send claim rechecks the exact occurrence/settings fingerprint and recipient authorization; unknown provider outcomes are never automatically resent. Chore payloads contain generic text and only household/occurrence routing IDs. Native taps open the authorized reminder screen. These paths have local fixture/provider-simulation evidence; hosted scheduling and physical delivery still require separate verification and activation.

Meal maintenance uses the same bounds with separate persisted scan/checkpoint state: 250 settings per fixed UTC-day window, 500 pending cancellations and 100 outbox/device pairs. Claims bind the exact saved meal/settings baseline. Payloads contain household/entry IDs only and open the protected meal-reminder screen. Lost checkpoint acknowledgments resume without resending or changing another source’s checkpoint.

Grocery maintenance uses separate persisted state with the same bounds: 250 settings per fixed UTC-day window, 500 pending cancellations and 100 outbox/device pairs. Claims recheck the unchecked item version, dated settings, recipient preferences and current authorization. Generic payloads include household/item routing IDs only. A lost checkpoint acknowledgment resumes without duplicate sends or changes to the renewal checkpoint.

Recurring reminder maintenance has independent checkpoints and the same 250-settings/window, 500-cancellation and 100-pair bounds. Claims recheck the active financial rule revision, current execution due date, reminder settings and recipient authorization. Generic payloads carry household/rule routing IDs, never amounts or financial details. Reminder delivery does not post a financial cycle. Source failures remain isolated; the APNs runtime performs no receipt polling.
