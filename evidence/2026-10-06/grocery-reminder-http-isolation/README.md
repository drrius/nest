# Grocery reminder HTTP receipt isolation

Four focused integration tests pass against a disposable PostgreSQL 18 cluster
and the pinned PostgREST 16.3 binary, with zero failures or skips.
[Actual output](local-tests.txt). No hosted or production database is involved.

The added case exercises the real API handler and PostgreSQL authorization.
The partner may read shared canonical reminder settings, but querying the owner's
operation ID returns an actor-bound unresolved result with no receipt. The owner
can still recover the original recorded receipt. Outsider and wrong-household
requests return 403; an anonymous request returns 401. Their bodies contain neither
the operation ID nor the saved revision. Operation row count remains one after
all GETs, proving these reads do not create cancellation tombstones.

The other three passing cases preserve coverage of lost-response recovery,
exact retries, substituted intent, stale writes, cancellation, query injection
and forged receipts. Protocol adapters in these local tests are test fixtures,
not evidence of native execution. The separate signed-native test is tracked
independently. Routine CI now includes this four-case file; its new run is pending.

PostgREST archive SHA256 matches the CI pin:
`4eb414eb948c8800863cc8c9896a17b611b2dccf9ff581f4d57f42ec9ccee40d`.
Focused formatting and lint complete without errors. Effect warnings for
Node-test async callbacks and direct HTTP probes remain visible.
