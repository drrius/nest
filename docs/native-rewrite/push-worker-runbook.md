# Push worker activation and acceptance

The worker source is available at `apps/api/push-worker.mjs`. It is disabled unless `NEST_PUSH_WORKER_ENABLED=true`. Source merges do not install a schedule, apply migrations or start this process.

Use an isolated development backend first, with separately approved additive migrations. Required server-only configuration:

- `NEST_SUPABASE_URL` and `NEST_SUPABASE_PUBLISHABLE_KEY` identify the backend.
- `NEST_SUPABASE_PUSH_SECRET` is a Supabase server secret, never a mobile environment variable.
- `NEST_PUSH_SCHEDULER_TOKEN` is a separate random 32-byte hexadecimal secret.
- `NEST_EXPO_PUSH_ACCESS_TOKEN` is optional Expo push access protection, when configured for the project.
- `NEST_PUSH_PORT` defaults to 8789. The server binds to loopback only.

After configuration and explicit activation, `node apps/api/push-worker.mjs` starts the dedicated process. An authenticated empty-body `POST /internal/push/run` performs one bounded maintenance/delivery/receipt cycle for renewals, chores, meals, groceries and daily summaries. Each source has its own durable page checkpoint; summaries scan only the current Zurich day. Each invocation visits at most 250 summary preferences and 100 summary/device pairs, with at most four concurrent sends per page. A source maintenance failure skips that source’s new sends while the other sources and shared receipt reads can still proceed. Use the scheduler token as a Bearer credential. Keep credentials out of command history and logs. Hosting must provide a private authenticated route to the loopback process and schedule repeat invocations; no hosting or scheduler is configured by this change.

Responses contain aggregate counts/status only, including separate summary, chore, meal and grocery maintenance/delivery statuses. `processed` includes attempts for all five sources; `complete` requires all five scan pages to complete. A 200 means the bounded invocation finished without runner failures, not that any notification appeared on a phone. `complete=false` requires another invocation. A 503 means some work failed or exceeded its deadline; a later invocation resumes durable state. Never reset sending/unknown attempts to ready manually: uncertain external sends cannot safely be repeated. Receipt polling has its own durable delay and expiry budget.

Before hosted activation, verify the actual Auth session schema and migrations in the isolated backend, configured Expo project/APNs credentials, explicit device enrollment, mute/revocation behavior, receipt outcomes and notification opening from foreground/background/cold start. Verify that scheduling fits the approved hosting and monthly budget. Production migration, purchases and release publication require separate owner approval.

Current evidence: disposable PostgreSQL, local HTTP/PostgREST and simulated Expo tests. Native APNs delivery, hosted execution and notification navigation are not accepted yet.

Chore maintenance visits up to 250 reminder settings in each of two fixed UTC-day windows, then up to 500 pending rows for invalidation. Its delivery scan visits at most 100 raw outbox/device pairs per invocation, using an independent compare-and-swap checkpoint. Invalid sessions still advance the cursor. A completed page wraps so later edits and new registrations are revisited. The send claim rechecks the exact occurrence/settings fingerprint and recipient authorization; unknown provider outcomes are never automatically resent. Chore payloads contain generic text and only household/occurrence routing IDs. Native taps open the authorized reminder screen. These paths have local fixture/provider-simulation evidence; hosted scheduling and physical delivery still require separate verification and activation.

Meal maintenance uses the same bounds with separate persisted scan/checkpoint state: 250 settings per fixed UTC-day window, 500 pending cancellations and 100 outbox/device pairs. Claims bind the exact saved meal/settings baseline. Payloads contain household/entry IDs only and open the protected meal-reminder screen. Lost checkpoint acknowledgments resume without resending or changing another source’s checkpoint.

Grocery maintenance uses separate persisted state with the same bounds: 250 settings per fixed UTC-day window, 500 pending cancellations and 100 outbox/device pairs. Claims recheck the unchecked item version, dated settings, recipient preferences and current authorization. Generic payloads include household/item routing IDs only. A lost checkpoint acknowledgment resumes without duplicate sends or changes to the renewal checkpoint.
