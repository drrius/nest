# Retained reschedule date boundary

The original public reschedule RPC accepts an infinite due date. The [before-fix
regression](before-fix.log) executes the actual audited closure engine and fails
because no exception is raised. New null/nonfinite/unsupported-year civil dates
are now rejected with22023 before the original closure engine. Finite past and
future dates remain allowed. Current authenticated household members can replay an
already committed old infinite-date command without changing history; no old rows
are normalized or removed. Membership and anonymous execution rules remain intact.

Migration `20261004151358_native_legacy_reschedule_dates.sql` preserves the original
RPC signature, empty search path and delegated recurrence/reminder/notification
engine. Eleven [focused database tests](focused-tests.log) pass without failures or
skips: four new reschedule, four completion-date and three real closure cases. They
prove unchanged state after rejected writes, finite bounds through9999, future
rescheduling, original anchors, exact replay, retained infinite-date receipt/history
and foreign/anonymous denial.

The [305-migration rehearsal](schema-probe.json) passes31 parent/date checks, the
existing36 tenant/calendar/search and16 receipt cleanup boundaries, and all prior
retained financial/receipt reconciliation, job pause, epoch/AI dispatch and committed
financial recovery checks. Only the exact unavailable old pg_net declaration is
excluded. Disposable local advisors pass their error gate. Manifest55/251 contains
exact source hashes and its four tests pass. Scoped formatting/lint and configured
source limits pass. No limit, permission or original trigger is weakened.

Applied only to nest-test, hosted version20261004151736. The actual body, empty
search path and authenticated/anonymous ACL match. [Ten real Auth/PostgREST negative
probes](hosted-negative-probes.json) pass for both members, outsider and anonymous.
[Hosted proof](hosted-proof.json) records unchanged complete finance/attachments and
all occurrences/completions/receipts. No successful hosted reschedule is attempted.
Advisors remain61 INFO/81 privileged WARN/one leaked-password WARN; remediation links
are preserved, with no findings suppressed. The first definition observer expected
a newline before the function delimiter; exact delimiter slicing corrected it
before any probe, without modifying deployed SQL.

Source138c1b01 routine CI37212413311 caught an unformatted saved rehearsal JSON.
Its formatting is corrected; repository format checking passes. [Corrected routine CI](ci-results.json) passes37212616501 at e2c9b536. Source
deep37212413167 passes138c1b01:23 core,50 conflicts and1,239 database/RLS cases,
zero failures/skips. The correction changes only documentation/report formatting;
a git comparison confirms migrations/tests/tooling are unchanged. The later new
lifecycle checker has separate local evidence and is not claimed in these counts. This is a bounded public
RPC/closure review;48 other legacy public functions and deeper private paths remain.
Local Auth/Storage are fixture interfaces, not live byte/native/phone evidence. No
production mutation, inference, worker activation, purchase, beta or merge occurred.
