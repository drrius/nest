# Chore API with real PostgREST

Run from the repository root:

```sh
NEST_TEST_PG_BIN=/path/to/postgres/bin \
NEST_TEST_POSTGREST_BIN=/path/to/postgrest \
node --test tests/integration/chore-postgrest.test.mjs
```

The test creates a disposable PostgreSQL cluster and a PostgREST Unix socket. Only its authentication fixture bridge binds an ephemeral loopback port. No existing database URL, credentials or production data are accepted. Real PostgREST validates locally generated test JWTs, applies database roles/RLS, embeds the composite routine relationship and executes the actual candidate completion RPC. The identity endpoint is a fixture, and the legacy completion function is a synthetic closure: this is not verification of Supabase Auth, full legacy recurrence or iPhone behavior.

Locally verified with PostgreSQL 18.6 and the official PostgREST 16.3 static Linux x86-64 release. The archive's SHA-256 matched the GitHub release asset digest `4eb414eb948c8800863cc8c9896a17b611b2dccf9ff581f4d57f42ec9ccee40d`. This targeted check is separate from routine CI, which runs HTTP adapter regressions and PostgreSQL invariants without downloading another binary.

The journey covers authorized reads, other-household denial, completion, lost-ack replay without duplicate closure, stale-date conflict and revoked membership. It caught PostgREST mapping SQLSTATE `40001` to HTTP 500; the API now uses the database error code to expose the intended HTTP 409. Unknown failures remain unavailable.

Adversarial regressions also verify that paused routines remain absent despite retained open/current occurrences, and mixed-case operation/occurrence UUIDs complete and retry successfully after PostgreSQL canonicalization. No duplicate closure is created.
