# Chore API with real PostgREST

Run from the repository root:

```sh
NEST_TEST_PG_BIN=/path/to/postgres/bin \
NEST_TEST_POSTGREST_BIN=/path/to/postgrest \
node --test tests/integration/chore-postgrest.test.mjs
```

The test creates a disposable PostgreSQL cluster and a PostgREST Unix socket. Only its authentication fixture bridge binds an ephemeral loopback port. No existing database URL, credentials or production data are accepted. Real PostgREST validates locally generated test JWTs, applies database roles/RLS, embeds the composite routine relationship and executes the actual candidate completion RPC. The identity endpoint is a fixture, and the legacy completion function is a synthetic closure: this is not verification of Supabase Auth, full legacy recurrence or iPhone behavior.

Locally verified with PostgreSQL 18.6 and the official PostgREST 16.3 static Linux x86-64 release. The archive's SHA-256 matched the GitHub release asset digest `4eb414eb948c8800863cc8c9896a17b611b2dccf9ff581f4d57f42ec9ccee40d`. Routine CI downloads this version-pinned archive, verifies its SHA-256 before extraction, and runs `pnpm test:integration:core` alongside HTTP adapter regressions and PostgreSQL invariants.

The journey covers authorized reads, other-household denial, completion, lost-ack replay without duplicate closure, stale-date conflict and revoked membership. It caught PostgREST mapping SQLSTATE `40001` to HTTP 500; the API now uses the database error code to expose the intended HTTP 409. Unknown failures remain unavailable.

Adversarial regressions also verify that paused routines remain absent despite retained open/current occurrences, and mixed-case operation/occurrence UUIDs complete and retry successfully after PostgreSQL canonicalization. No duplicate closure is created.

## Native transport and SQLite restart

With the same two binary environment variables, run `node --test apps/mobile/tests/integration/chore-roundtrip.test.mjs`. This exercises the native Effect client through the actual Node HTTP server, API, PostgREST and PostgreSQL. It drops a successful response, reopens file-backed SQLite, replays the original operation without a second closure, marks a deleted target as a recoverable conflict and preserves an unacknowledged attempt when membership is revoked. Native SQLite and Supabase Auth remain fixture boundaries; this does not claim an iPhone process restart or Apple authentication.

## Grocery commands and bigint transport

With the same binary variables, run `node --test tests/integration/grocery-postgrest.test.mjs`. Actual PostgREST/PostgreSQL exercise empty and populated count-verified reads, category tenancy, add/retry/check, stale-version edits, AI-tool removal, deleted-target errors and revoked membership. A fixture-seeded version above JavaScript's safe integer range proves projection/command/receipt values remain exact strings. The fixture contains audited grocery constraints and synthetic Auth; it is not a full legacy-schema rehearsal or native UI test.
