# Private conversation storage verification

Run `NEST_TEST_PG_BIN=/path/to/postgres/bin pnpm test:conversations`. The harness creates a disposable local PostgreSQL cluster with synthetic members, no TCP listener and no existing database URL. It always stops the cluster after the tests.

The gated migration provides owner-private transcripts, schema versions, optimistic revision checks and atomic idempotent save receipts. Old retries return their original revision without replacing newer content. Receipt hashes avoid retaining another complete transcript for every save. Revoked members lose access without transferring or deleting their private history.

Only the bounded transcript envelope is validated in SQL. API integration must validate SDK message parts, bind verified membership, and treat saved approval messages as untrusted data. This storage function cannot authorize financial commands. Concurrent writes produce a conflict; automatic stream reconciliation, server generation ownership, cancellation/finalization and native reconnect remain unimplemented.

The membership baseline now loads the audited legacy tenancy migrations documented in `legacy-tenancy/README.md`. These tests prove focused tenancy compatibility, but do not prove compatibility with the complete legacy schema or live Supabase authentication. The harness was reused unchanged from the audited chore receipt fixture in PR #4. No production migration is run by these tests or CI.

The configured PostgreSQL directory must contain `psql`, `initdb` and `pg_ctl`. Queries have database statement/lock timeouts and subprocess deadlines. Exit/SIGINT/SIGTERM cleanup is registered before startup; failed fast shutdown falls back to immediate shutdown and a status check before removing data; SIGKILL and host failure cannot run cleanup. The test command also verifies timeouts and graceful cancellation using real subprocesses.

If shutdown cannot be confirmed, cleanup reports the retained data directory for recovery rather than deleting files under a potentially running server. Listener cleanup is unconditional. Lifecycle tests inject startup and shutdown failures against actual disposable PostgreSQL processes.
