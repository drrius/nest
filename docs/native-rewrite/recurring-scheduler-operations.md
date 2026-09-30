# Recurring scheduler operations

Status: implemented local server and default-disabled hosted adapter; disabled test Preview deployed and verified. Active hosted execution and timer registration remain outstanding. Source merges do not register a timer or execute production migrations. Production scheduling needs separate owner approval.

## Server entry point

`apps/api/recurring-worker.mjs` runs a dedicated Node 24+ loopback server. Start from `apps/api` with `node --env-file=/path/to/server-only.env recurring-worker.mjs`. No credentials are included in the repository.

Required server-only configuration:

- `NEST_SUPABASE_URL`: the approved backend origin.
- `NEST_SUPABASE_PUBLISHABLE_KEY`: that backend's publishable key.
- `NEST_SUPABASE_RECURRING_SECRET`: a server secret (`sb_secret_…`), never a mobile environment variable.
- `NEST_RECURRING_SCHEDULER_TOKEN`: an independently generated random 32-byte token, encoded as 64 lowercase hexadecimal characters. Do not reuse a user bearer, publishable key or backend secret.
- Optional `NEST_RECURRING_PORT`: loopback port, default 8788. A hosted adapter/reverse proxy must preserve request cancellation and permit the bounded execution lifetime.

Invoke `GET /internal/recurring/run` with `Authorization: Bearer <scheduler token>`. The endpoint accepts no query or body. It creates its own run identity and caps work at five candidates. It does not accept household, rule, mandate, operation or budget overrides. Keep authorization headers out of access logs.

A successful HTTP response contains only run identity, processed/failed counts, sweep completion and a finite scan-failure code. It omits household cursors, financial amounts, rule configuration and credentials. Responses are no-store. HTTP 409 indicates an active/expired lease conflict; HTTP 503 indicates a failed candidate, scan, backend request or bounded invocation failure. A completed sweep can still report failed candidates: completion describes traversal, not successful posting of every obligation. Alert/review failures rather than treating a completed traversal as financial success.

## Recovery and bounds

Each invocation has a 90-second Effect timeout and each database HTTP request has a ten-second timeout. It holds a ten-minute checkpoint lease; a dead invocation delays its replacement until expiry. These are application limits, not evidence of any host's runtime allowance. Validate the selected host before activation.

The next invocation reads the durable continuation. Failed candidates do not starve later candidates. After a completed sweep, discovery restarts and revisits still-due failures. A job whose reply was lost remains protected by immutable job/cycle receipts. A worker can finish an already-started financial transaction after its lease expires, but cannot move a newer worker's checkpoint. This is at-least-once execution with duplicate-proof financial posting, not a claim of exactly-once network delivery.

After a lost checkpoint acknowledgment, a new run resumes the stored cursor. After termination before checkpoint completion, the next lease holder resumes the previous stored cursor. Reprocessing is safe; skipping uncommitted work is not. Do not manually advance the cursor to clear failures or mutate financial history during recovery.

## Activation gate and outstanding evidence

The legacy reference uses `pg_cron` for reminder/draft jobs (`20260812090000_notifications_realtime.sql`) and a separate invocation path (`20260814120000_invoke_push_dispatch.sql`). Those files are reference evidence only; their registrations, credentials and draft-posting semantics have not been copied or enabled for Nest.

Before any hosted registration, identify the isolated test backend and approved host, verify available scheduling/runtime quotas and the aggregate CHF20 ceiling, install only the reviewed gated schema into that approved environment, and configure server-only credentials. Then test actual authenticated scheduler delivery, lease expiry, delayed/catch-up processing, cancellation races, backend outages and retained cycle audit against synthetic households. No production opt-in or historical backfill follows from that test.

Still needed: deployed/verified host execution, reviewed timer registration kept outside automatic migrations, controlled hosted verification, native delayed-scheduling/cycle-history visibility and production activation approval. No free-tier uptime or quota sufficiency is assumed. No purchase, external service provisioning, migration or release is performed by this local entry point itself.

## Default-disabled Vercel adapter

`apps/api/api/recurring.mjs` exposes the existing Web Request scheduler through a separate compiled bundle, routed only at `/internal/recurring/run`. It preserves request cancellation, the 90-second worker bound, original GET/no-query/no-body policy, independent scheduler-token check and five-job durable continuation. Existing user API/AI handlers are unchanged. No cron entry or migration registration is added.

The additional server-only gate `NEST_RECURRING_WORKER_ENABLED=true` is required. Without that exact opt-in, the function returns a no-store 404 without reading privileged configuration. Enabled-but-incomplete/invalid configuration returns a finite no-store 503; arbitrary configuration/private key values are never returned. The required Supabase origin/publishable key, separate `NEST_SUPABASE_RECURRING_SECRET` and random `NEST_RECURRING_SCHEDULER_TOKEN` follow the local adapter rules above. A user bearer, Supabase secret or query override cannot authorize a run.

The function declares a 300-second host limit around the existing 90-second application timeout. Vercel documents [300 seconds for Hobby with Fluid compute](https://vercel.com/docs/functions/limitations); verify the actual test project's Fluid compute/runtime setting before activation. Non-Fluid Hobby permits at most 60 seconds and does not meet this bound. Vercel Hobby's [cron frequency and precision](https://vercel.com/docs/cron-jobs/usage-and-pricing) are once daily/within the hour; no higher-frequency timer or paid-plan upgrade is implied. Timer hosting/precision remains an explicit unresolved gate.

Focused runtime checks cover disabled/no-privileged-read behavior, secret-safe configuration failures, exact path/method/query/token gates and unchanged user API behavior. Real isolated PostgreSQL/PostgREST HTTP checks verify that even a valid scheduler token cannot activate a disabled host; an enabled host retains five-then-one continuation, rejects user/backend credentials before claiming and posts six explicitly approved fixed cycles once across repeated runs. Actual compiled bundle/function checks also return disabled 404. These prove the local adapter, not deployed scheduling, hosted financial reconciliation or physical-phone visibility.
