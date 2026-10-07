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

The two-profile public-key-only GET probe is invoked twice, once for observation
and once to retain its output. Each invocation requests zero rows with storage/private
Accept-Profile headers. Both receive406/PGRST106 Invalid schema. This confirms
those direct REST profiles are currently unexposed; it does not rule out indirect
privileged RPCs, trusted service access or Storage service paths. No row data is
returned or mutation attempted. Managed grants remain unchanged.

Read-only hosted policy inventory records exactly three objects policies: household
SELECT, restrictive native receipt SELECT and attachment-state DELETE. Their
source predicates are reviewed alongside household_attachment_uploads RLS. No
client INSERT policy exists; byte-inspecting upload uses the trusted Edge path.
One focused real PostgREST/PG test passes unposted uploader-only reads, shared
claimed financial reads and partner cleanup refusal. This is disposable HTTP/RLS
behavior, separate from hosted catalog and prior actual native stored-byte evidence.
No hosted delete/insert/TRUNCATE is attempted.

The actual hosted inventory contains only base tables:68 private,109 public and
eight Storage. No views/materialized views are present in these schemas. Neither
client role has direct SELECT on private tables. This reduces the direct table
read surface; it does not authorize or prove delegated private-function access.

The grant drift motivates one new disposable barrier test. A BYPASSRLS service role
with broad grants writes before freeze, reads retained rows during freeze, and is
refused INSERT/UPDATE/DELETE/TRUNCATE on both public/private RLS-enabled tables.
Unfreeze restores writes. The selected test passes with zero failures/skips and
is added to fast CI. This establishes the trigger boundary under broad grants,
not hosted freeze activation, Storage control or live external-writer drainage.

Routine CI37572407700 passes source d8c8c2ed, including the new table inventory
and selected broad-service-role freeze test. The stored metadata records that
source; it does not establish hosted cutover activation or future-source CI.
