# Effective table access inventory

The migration diagnostic now captures every public/private/storage base table,
partitioned table, view and materialized view. Effective inherited column/table
privileges are separate from schema USAGE, RLS flags and policy counts. These
fields map review scope; grants and enabled RLS do not prove policy semantics.

Seven focused real PostgreSQL tests pass with zero failures/skips. The new test
exercises inherited column SELECT, denied private-schema access, actual successful
read after USAGE, a granted public SELECT returning zero rows under RLS and separate
Storage TRUNCATE privileges. Routine CI adds only this focused test.

The full disposable rehearsal applies 54 legacy and 257 Nest migrations and
completes with exact original and cutover financial reconciliation. It captures
179 relations before and after simulated cutover controls: 68 private, 109 public,
two modeled Storage tables. No client-accessible base table lacks RLS in the fixture.
Auth and Storage interfaces are modeled; this is not production or stored-byte proof.

A single authorized read-only nest-test catalog query returns185 relations. All179
fixture relations exist, with six additional managed Storage infrastructure tables.
120 shared rows match exactly. The other59 differ only in privilege fields; RLS,
forced-RLS, relation kinds and policy counts match for shared relations. Most drift
is broader hosted service_role grants absent from the disposable role setup.
Client differences occur only in managed storage.buckets/objects. The hosted
catalog includes TRUNCATE grants for anon/authenticated there. RLS does not govern
TRUNCATE, but this catalog alone establishes no exposed callable execution path.
No destructive query is run, no managed grants are revoked and no provider setting
is changed. Execution-path exposure and trusted-service behavior remain open.

No hosted client-accessible base table lacks RLS. This does not establish complete
tenant isolation, every private call chain, view security semantics, Storage APIs,
external writer drainage or cutover. All differences are preserved in comparison.json.
No hosted/production data mutation, inference, deployment, merge or release occurs.
