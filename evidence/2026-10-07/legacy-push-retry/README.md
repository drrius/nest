# Legacy push retry rehearsal

The full disposable 311-migration schema diagnostic now verifies expired legacy
push claims with an active subscription: the claim is released to pending without
losing attempts or implying delivery, stale finalization refuses, one failed
replacement claim increments once, a replay cannot increment twice, pausing
preserves the retry, and a disabled subscription is skipped. No network delivery
occurs. All six explicit database assertions pass.

The producer/consumer/control/claim/subscription snapshots restore exactly after
rollback. The existing financial reconciliation passes for seven original events,
eight allocations, 14 ledger rows and one receipt reference; other full-schema
recovery/boundary checks remain in the hashed private diagnostic. This is a
fixture diagnostic, not production cutover completion.

The initial fixture placed expiry before claimed_at; the actual lease constraint
correctly rejects it. The correction changes only synthetic claimed_at to precede
expiry. No constraint, live data or production function is altered. The successful
run also includes subscription rows in the rollback snapshot.

Auth/Storage tables are simulated and pg_net is explicitly excluded. Actual Edge
delivery, external requests, hosted schedulers, stored bytes and production writer
drainage remain unverified. The tool never accepts an existing database URL and
has not run against production or the hosted test project.
