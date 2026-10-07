# Private function privilege inventory

The current writer inventory now includes private-schema function privileges.
It reports effective inherited EXECUTE separately from schema USAGE for anonymous,
authenticated and service roles. Having EXECUTE alone does not authorize a direct
schema-qualified call. This inventory does not classify every callable function as
a writer or claim that its body is safe.

Six focused database tests pass with zero failures/skips. The new test verifies
real inherited EXECUTE, schema denial, inherited USAGE enabling a real call,
function-specific service denial and removal after revocation. Existing reversible
API-fence and writable-view checks continue to pass. Configured scoped Oxlint passes.

The complete disposable migration rehearsal applies 54 legacy and 257 Nest
migrations. All reconciliation and boundary checks complete; the original financial
history, receipt relationships and modeled excluded records remain reconciled.
The only skipped legacy statement enables unavailable pg_net. Auth/Storage interfaces
are simulated locally; PostgreSQL18.6 differs from hosted PostgreSQL17.6.
[Actual rehearsal](schema-report.json).

A single read-only nest-test catalog query finds 219 private signatures. Every
signature and effective privilege field matches the compiled fixture. Authenticated
has EXECUTE plus schema USAGE for 177 entries. Anonymous has EXECUTE for two entries
but lacks schema USAGE for both. Indirect definer calls require separate review.
[Query](catalog-query.sql), [hosted result](hosted-catalog.json),
[comparison](catalog-comparison.json).

The legacy public inventory has two additional hosted service-only wrappers and two
additional service-writable tables. Both wrappers deny client EXECUTE, and both tables
deny client writes. These differences remain recorded, not normalized or suppressed.
No hosted permission, schema or data mutation occurs.

The progress checklist now references the later public-entry inventory: all 60 legacy
public definers and two invokers have bounded evidence. The previously reported
49–53 pending counts described older checkpoints. Private call-chain semantics,
direct table/Storage policies, trusted-service and external writers, old-client intent
drainage, real Auth/Storage migration and full M9 cutover remain open. This inventory
is a map for that work, not completion of it. No native run, inference, worker,
production access, merge, beta publication or automation occurs.
