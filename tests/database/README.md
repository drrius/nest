# Disposable PostgreSQL verification

Run `NEST_TEST_PG_BIN=/path/to/postgresql/bin pnpm test:database`. The directory must contain `initdb`, `pg_ctl` and `psql`; all three use the configured installation. Run as an ordinary user. Local socket binding needs permission in sandboxed environments.

The harness accepts **no existing database URL**. It creates a fresh cluster under a randomized `nest-db-` temporary directory, with a private Unix socket, no TCP listener and trust authentication restricted by the directory's owner-only permissions. Normal completion, SIGINT and SIGTERM stop and remove the cluster. Failed fast shutdown falls back to immediate shutdown and status verification; an unconfirmed shutdown retains its directory and reports a recovery error. SIGKILL and host failure cannot run cleanup. It does not install or modify system database services.

Twelve tests exercise the actual candidate migration against PostgreSQL: atomic completion/receipt, lost-ack retries, changed-payload rejection, partner acknowledgment, RLS/private receipt reads, direct-write denial, anonymous/outsider rejection, stale/skipped conflict, concurrent partner and duplicate requests, receipt-failure rollback, invalid dates, stale completed-date rejection and membership revocation. The underlying legacy closure is a minimal synthetic SQL fixture; real legacy recurrence/window behavior is explicitly outside this proof.

Local evidence: PostgreSQL 18.6 portable server package matching this host's libraries, verified against the system package-signing keyring. Twelve tests pass in about one second. CI uses its installed PostgreSQL server binaries; its version is independent of local evidence.

The integrated command also runs ten approval tests against audited tenancy, twelve grocery receipt tests and six real-process lifecycle/timeout tests (65 total, including ten conversation and fifteen busy-sharing cases). `test:approvals` runs the ten approval cases alone. These fixtures are independent clusters and do not prove whole-migration-chain compatibility.

## Private conversations

`pnpm test:conversations` runs ten focused cases against the audited legacy tenancy baseline. The gated migration provides owner-private transcripts, schema versions, optimistic revision checks and atomic idempotent save receipts. Older retries return their original revision without replacing newer content; receipt hashes avoid retaining duplicate transcripts. Revoked members lose access without transferring or deleting their private history.

Only the bounded transcript envelope is validated in SQL. API integration must validate SDK message parts, bind verified membership and treat saved approval messages as untrusted data. This storage function cannot authorize financial commands. Stream reconciliation, server generation ownership, cancellation/finalization and native reconnect remain unimplemented. The fixtures prove focused tenancy compatibility, not the complete legacy schema or live Supabase authentication.

Calendar clients must call `nest_get_calendar_consent` before presenting sharing controls and bind its incarnation to the exact user intent. Never rebind delayed intents automatically to a new incarnation. Initialization is disabled; only explicit consent mutations enable sharing. Capture and publish commands require the same incarnation. Fifteen busy-sharing tests cover freshness, opt-out and delayed opt-in/capture rejection across membership removal and rejoin.

## Private AI turn ownership

`node --test tests/database/ai-turns.test.mjs` uses the same disposable PostgreSQL harness. Sixteen cases prove prompt claim/replay, duplicate and competing starts, owner-only RLS, atomic completion/interruption, protected transcript revisions, deadline handling, input bounds and rollback. The ten existing conversation cases also apply the turn migration to detect compatibility regressions. Full database verification now covers 92 cases.

A lost begin response returns `claimed: false` on retry even if the model never started. The caller must inspect the saved turn and expose interruption/recovery; it must never interpret a running or expired receipt as permission to start another model execution. Only an explicit new request can claim a new turn after the previous turn is finalized. A terminal replay never modifies later history. These records do not authorize tool effects or financial approval; the API must validate SDK parts and reauthorize every shared command. Tool invocation journals, server streaming/finalization, approval resume and actual native lifecycle verification remain subsequent integration work.
