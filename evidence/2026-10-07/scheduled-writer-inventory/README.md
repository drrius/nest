# Scheduled-writer inventory preparation

The read-only migration helper now captures the cron job catalog and definitions
of the eight audited legacy entry points. Job identity, name, active state,
database, role and schedule are retained. Command and function-definition SHA-256
hashes are computed inside PostgreSQL; bodies and embedded credentials are never
included in the returned report. Unknown and inactive jobs are retained.

It accepts a caller-owned SQL executor, not a database URL, and never starts,
stops or alters a job. The executor must use a fresh session per call. Each query
uses a read-only repeatable-read transaction, a pg_catalog search path and rollback.
Catalog metadata and job/function observations share the final statement snapshot.

The schema runner now includes this observation and focused CI includes the six
new cases alongside the existing migration access/fence tests. Thirteen actual
disposable PostgreSQL cases pass with zero failures/skips. [Results](focused-tests.log).
They cover absent extension/catalog, unsupported shape, insufficient privileges,
RLS-filtered visibility, unknown/inactive jobs, server-side hashes, unchanged rows
and function definitions, a 1,001-job bound, and refusal to commit a caller's
already writable transaction.

The first writable-session assertion expected the helper's own refusal message.
PostgreSQL refused earlier because transaction isolation cannot change after a
query. The assertion now requires that actual database error and separately proves
the fixture table was not committed. [Initial outcome](initial-session-assertion.log).
No guard or invariant was weakened.

These are catalog fixtures without an installed pg_cron extension or running
scheduler. They prove the read-only inventory behavior, not hosted execution or a
complete live inventory. Extension ownership, full visibility and the row bound
must all pass before catalogSnapshotComplete can be true. Missing evidence returns
null jobs or an explicitly incomplete snapshot, never confirmed scheduling absence.
External invokers, in-flight drainage and cutover verification always remain false.

No hosted database or production data was accessed, credentials transferred,
worker enabled, financial event created, beta submitted or merge performed.
The existing 311-migration rehearsal and native build evidence are retained;
neither is rerun for this tooling/report-only change. Hosted catalog/function
identity and authorized existing-data rehearsal remain open.
