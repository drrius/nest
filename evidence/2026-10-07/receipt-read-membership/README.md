# Receipt access after membership removal

Two focused cases pass against the real Nest API, disposable PostgreSQL and
PostgREST, with zero failures or skips in 2.523 seconds. Auth verification uses the
existing synthetic bridge; the typed caller is a test-only protocol adapter.
This does not establish native execution or managed Storage HTTP behavior.

Before financial claim, the uploader can read receipt metadata and the partner
cannot. After claim, both members read the same event-bound receipt. Deleting its
authoring member fails the existing financial-event foreign key; both readers
still work and every financial event, allocation, ledger entry, upload reservation
and object metadata row remains identical. No constraint is bypassed to simulate
revocation.

In a separate fixture without financial history, membership removal succeeds.
Both previously issued caller tokens receive 403/not_a_member and no-store for
new metadata and link requests. The direct receipt RPC also refuses the removed
actor, and the partner remains unable to read that unposted attachment. Retained
financial/upload/object rows are identical before and after the access checks.

The initial extension attempted to delete a financial author and correctly failed
the foreign key. The revised test initially used the nonexistent table name
expense_allocations and then expected the API error name from the SQL exception.
Those fixture assertions are corrected to financial_allocations and the actual
SQL authorization refusal. Shipping SQL, API behavior and financial history are
unchanged.

Run with the retained local PostgreSQL and PostgREST binaries:

```sh
NEST_TEST_PG_BIN=/tmp/nest-postgres-18-fixture/usr/bin \
NEST_TEST_POSTGREST_BIN=/tmp/nest-leftovers-postgrest-20261007/postgrest \
node --test tests/integration/receipt-read-postgrest.test.mjs
```

Routine CI now selects these two cases. Its updated-commit result remains pending
until the workflow finishes. Auth session revocation and already-issued signed
URL revocation are not proven: links have a 60-second TTL and may remain usable
until expiry. No hosted membership, receipt bytes or production records changed.
