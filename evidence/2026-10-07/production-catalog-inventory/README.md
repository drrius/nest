# Production catalog inventory

Read-only production metadata was inspected on 7 October 2026 for the project
identified by the connector as `household-os`, ref `fdtqmcfwhbddswdpnmcq`.
The SQL requests use repeatable-read, read-only transactions and roll back.
Both catalog and scheduler observations confirm `readOnly=true`. No household,
Auth-session/user or Storage-object rows, file bytes, credentials, function bodies
or scheduler command bodies are exported. No application function is invoked,
job paused, migration applied, deployment changed or production data modified.

## Observed writers

Production has 50 public relations and no `nest_` relations. There are 78 public
and 75 private functions/procedures in the captured catalog. Signatures, owners,
security-definer flags, execution permissions and SHA256 definition hashes are
recorded in [catalog.json](catalog.json), using [catalog.sql](catalog.sql).

The extension-owned pg_cron 1.6.4 catalog is present, readable, has the expected
shape and permits unfiltered row visibility. [Readiness](cron-readiness.json)
records these checks. The single [scheduler snapshot](scheduled-writers.json)
at 19:24:41 UTC has eight active legacy registrations: due reminders, activity
retention, purchased-grocery retention, due occurrences, member digests,
recurring drafts, push-outbox drainage and push dispatch. Schedules and role names
are retained; command bodies are hashed inside PostgreSQL. This is registration
inventory, not proof that no invocation is currently running or that external
work has drained.

Two [active Edge functions](edge-functions.json) are listed: `push-dispatch`
version 44 and `household-attachment-upload` version 1. All nine returned
application-source files match the audited legacy repository exactly.
[Comparison](edge-source-comparison.json) records paths, local hashes, bundle
identity and JWT flags without exported source bodies. Resolved third-party
code, environment/configuration, authentication effectiveness and execution are
not verified by those matches. Neither endpoint is called or redeployed.

## Managed ownership

The [Auth/Storage metadata](managed-ownership.json) matches the bounded fixture
model: separate schema and table owners, RLS enabled, runtime data grants, and no
runtime ownership inheritance or ability to SET the owner role. The catalog-only
[queries](managed-ownership.sql) read no managed data rows. Matching these fields
does not establish all grants, full schema/API behavior or hosted administrative
hook equivalence.

## Migration limits

The [disposable comparison](legacy-comparison.json) applies 54 legacy migrations
and explicitly excludes only the unchanged pg_net extension declaration. All 55
inputs are hashed. All 148 common public/private function definitions, security
flags and API-role execution grants match production. No fixture-only function
or field mismatch occurs. The owner differences, `postgres` versus
`nest_fixture_owner`, remain recorded for all 148 shared functions; no capability
or runtime-semantic equivalence is inferred.

Exact catalog parity is **false**. Production has five additional signatures:
`public.payroll_is_member()`, `public.payroll_payslip_guard()`,
`public.payroll_payslip_supersede()`, `public.payroll_restore(jsonb)` and
`public.rls_auto_enable()`. The local command intentionally exits 1 for this
mismatch. The legacy migration references/revokes the platform auto-RLS helper,
but the disposable bootstrap does not define that platform hook. The four payroll
functions have no matching legacy migration source. [Bindings](production-only-bindings.json)
identify two enabled triggers on `public.payroll_payslips` and the platform
`ensure_rls` DDL event trigger, without reading rows or function bodies. Payroll
source/ownership clarification is pending; none of these objects is changed.

Rerun only the local fixture comparison, without hosted access:

```sh
NEST_TEST_PG_BIN=/path/to/disposable/postgres/bin node tools/migration/compare-legacy-catalog.mjs \
  /path/to/audited/household-os/supabase/migrations \
  evidence/2026-10-07/production-catalog-inventory/catalog.json \
  /tmp/nest-legacy-catalog-comparison.json
```

Three focused comparison tests pass. They distinguish missing/extra overloads,
body/permission changes, malformed evidence and owner differences. Scoped lint
reports no errors, with existing Node filesystem/path advisory warnings retained.
No native migrations, domain seeds or full rehearsal are repeated for this
identity question. This inventory narrows trusted-writer uncertainty; it does
not close M9. Existing financial/history and
receipt reconciliation, private runtime semantics, external invokers, pending
client/server intents and in-flight drainage still require their own evidence.
Keep the eight observed jobs and both Edge writers running until separately
approved cutover decisions and drainage are ready. No retain/replace/stop action
is inferred from this read-only inspection. Production migration, retirement and
publication remain separate owner gates. Build 23 and all clients are unchanged.
