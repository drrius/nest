# Disposable PostgreSQL verification

Run `NEST_TEST_PG_BIN=/path/to/postgresql/bin pnpm test:database`. The directory must contain `initdb`, `pg_ctl` and `psql`; all three use the configured installation. Run as an ordinary user. Local socket binding needs permission in sandboxed environments.

The harness accepts **no existing database URL**. It creates a fresh cluster under a randomized `nest-db-` temporary directory, with a private Unix socket, no TCP listener and trust authentication restricted by the directory's owner-only permissions. Normal completion, SIGINT and SIGTERM stop and remove the cluster. Failed fast shutdown falls back to immediate shutdown and status verification; an unconfirmed shutdown retains its directory and reports a recovery error. SIGKILL and host failure cannot run cleanup. It does not install or modify system database services.

Twelve tests exercise the actual candidate migration against PostgreSQL: atomic completion/receipt, lost-ack retries, changed-payload rejection, partner acknowledgment, RLS/private receipt reads, direct-write denial, anonymous/outsider rejection, stale/skipped conflict, concurrent partner and duplicate requests, receipt-failure rollback, invalid dates, stale completed-date rejection and membership revocation. The underlying legacy closure is a minimal synthetic SQL fixture; real legacy recurrence/window behavior is explicitly outside this proof.

Local evidence: PostgreSQL 18.6 portable server package matching this host's libraries, verified against the system package-signing keyring. Twelve tests pass in about one second. CI uses its installed PostgreSQL server binaries; its version is independent of local evidence.

The integrated command also runs ten approval tests against audited tenancy, twelve grocery receipt tests and six real-process lifecycle/timeout tests (50 total, including the ten conversation cases described below). `test:approvals` runs the ten approval cases alone. These fixtures are independent clusters and do not prove whole-migration-chain compatibility.

## Private conversations

`pnpm test:conversations` runs ten focused cases against the audited legacy tenancy baseline. The gated migration provides owner-private transcripts, schema versions, optimistic revision checks and atomic idempotent save receipts. Older retries return their original revision without replacing newer content; receipt hashes avoid retaining duplicate transcripts. Revoked members lose access without transferring or deleting their private history.

Only the bounded transcript envelope is validated in SQL. API integration must validate SDK message parts, bind verified membership and treat saved approval messages as untrusted data. This storage function cannot authorize financial commands. Stream reconciliation, server generation ownership, cancellation/finalization and native reconnect remain unimplemented. The fixtures prove focused tenancy compatibility, not the complete legacy schema or live Supabase authentication.
