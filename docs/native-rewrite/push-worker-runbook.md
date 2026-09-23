# Push worker activation and acceptance

The worker source is available at `apps/api/push-worker.mjs`. It is disabled unless `NEST_PUSH_WORKER_ENABLED=true`. Source merges do not install a schedule, apply migrations or start this process.

Use an isolated development backend first, with separately approved additive migrations. Required server-only configuration:

- `NEST_SUPABASE_URL` and `NEST_SUPABASE_PUBLISHABLE_KEY` identify the backend.
- `NEST_SUPABASE_PUSH_SECRET` is a Supabase server secret, never a mobile environment variable.
- `NEST_PUSH_SCHEDULER_TOKEN` is a separate random 32-byte hexadecimal secret.
- `NEST_EXPO_PUSH_ACCESS_TOKEN` is optional Expo push access protection, when configured for the project.
- `NEST_PUSH_PORT` defaults to 8789. The server binds to loopback only.

After configuration and explicit activation, `node apps/api/push-worker.mjs` starts the dedicated process. An authenticated empty-body `POST /internal/push/run` performs one bounded maintenance/delivery/receipt cycle. Use the scheduler token as a Bearer credential. Keep credentials out of command history and logs. Hosting must provide a private authenticated route to the loopback process and schedule repeat invocations; no hosting or scheduler is configured by this change.

Responses contain aggregate counts/status only. A 200 means the bounded invocation finished without runner failures, not that any notification appeared on a phone. `complete=false` requires another invocation. A 503 means some work failed or exceeded its deadline; a later invocation resumes durable state. Never reset sending/unknown attempts to ready manually: uncertain external sends cannot safely be repeated. Receipt polling has its own durable delay and expiry budget.

Before hosted activation, verify the actual Auth session schema and migrations in the isolated backend, configured Expo project/APNs credentials, explicit device enrollment, mute/revocation behavior, receipt outcomes and notification opening from foreground/background/cold start. Verify that scheduling fits the approved hosting and monthly budget. Production migration, purchases and release publication require separate owner approval.

Current evidence: disposable PostgreSQL, local HTTP/PostgREST and simulated Expo tests. Native APNs delivery, hosted execution and notification navigation are not accepted yet.
