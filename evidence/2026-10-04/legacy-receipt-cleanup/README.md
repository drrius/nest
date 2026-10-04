# Legacy cleanup and private native receipts

## Confirmed problem and fix

The retained public cleanup RPCs bypassed native receipt ownership. A partner's
automatic sweep could mark an uploader's older, unposted native receipt deleting;
the partner could also finish its cleanup record after the object was absent.
The existing restrictive Storage read policy prevented partner byte reads, but
did not prevent these privileged registry changes from invalidating exact retries.

[Before-fix output](before-fix.log) records both real PostgreSQL regressions against
the unchanged legacy implementations. The temporary observer uses the committed
test source with only the new migration omitted; it is not a shipping adapter.
The initial fixture incorrectly treated actor3 as unaffiliated; actor3 belongs to
a foreign household. That assumption was corrected before final verification.

Migration `20261004134604_native_receipt_legacy_cleanup_owner.sql` keeps native
cleanup bound to the upload intent's uploader. Candidate selection retains the
20-row bound, ordering and SKIP LOCKED; ownership is checked again after obtaining
the upload row lock with a fresh statement snapshot. Legacy non-native abandoned
files remain household-cleanable. Claimed receipt history is unchanged. Cleanup
never deletes object bytes or metadata itself.

## Locally verified

- [17 focused database tests](focused-tests.log), zero failures/skips: seven new
  legacy cleanup regressions plus existing cleanup/immutable-identity cases.
  Eight concurrent financial claim/legacy cleanup/partner-sweep trials have one
  safe claim-or-cleanup winner and retain object metadata; existing native cleanup
  and reservation races also pass.
- [Full migration rehearsal](schema-probe.json):303 applied migrations, with only
  the exact unavailable legacy pg_net declaration excluded. All retained history,
  privacy, cutover and recovery checks pass, including16 rolled-back attachment
  boundary probes and the prior36 calendar/search/usage probes. Seven retained
  financial events, eight allocations,14 ledger entries and one receipt reference
  reconcile exactly. Security advisors run on the disposable socket and pass the
  error gate; actual command output is retained in the report.
- Scoped Oxlint/Oxfmt and source limits pass. Existing tooling async/builtin
  migration diagnostics remain warnings; no limit or policy was disabled.

These are actual local PostgreSQL transactions with synthetic actors and a Storage
metadata interface. They do not establish live Auth, Storage HTTP/bytes, native
receipt execution, phone behavior or the exact candidate-selection race interleaving.

## Hosted and CI status

The authorized `nest-test` project (`tkjixmujjoustdiedfmw`) was read as healthy and
still had the vulnerable legacy definitions. The verified migration is now applied
only there. Before/after digests exactly match all52 financial events, allocations,
ledger, upload registry, native intents and Storage metadata. Both hosted function
bodies match the local migration, empty search paths remain and anonymous EXECUTE
is denied while authenticated EXECUTE remains. No hosted fixture mutation occurred.
[Hosted proof](hosted-proof.json) distinguishes definition/ACL/digest checks from
live Auth, Storage HTTP and native behavior.

Hosted security advisors still report81 authenticated security-definer warnings,
61 RLS-without-policy informational findings and the existing leaked-password
protection warning. These are retained findings, not a clean-schema claim; the
other privileged paths and Auth configuration remain M9 work. See the
[privileged-function guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Source `956cd927` is pushed. Routine CI37207407493 rejected its missing new
migration checksum manifest entry; the omission is now corrected, without changing
the verified SQL. The four focused manifest tests pass locally. Deep
integration37207534599 now passes:23 core HTTP/database,50 terminal-conflict and
1,231 database/RLS cases, zero failures/skips, including all seven new regressions.
[CI results](ci-results.json) retain the actual labels/counts. It was explicitly
dispatched for the touched database invariants. Corrected-source `3b141cc5` passes routine CI37207727428,
including formatting, limits, typechecking, the Edge entry-point check, all four
manifest cases and existing focused unit/core integration checks. The migration
SQL and regression source are unchanged from the successful deep integration source.

Hosted migration version `20261004135633` is recorded separately from the source
filename timestamp; equality was checked from actual compiled bodies, not inferred
from migration names or the checksum manifest.

No production action, purchase, new beta, merge or live AI enablement occurred.
M1–M9 remain incomplete;50 other legacy public privileged functions and deeper
private paths still require their own bounded review. Reviewing these three RPCs
does not make the entire retained schema safe or authorize production cutover.
