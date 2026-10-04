# Legacy completion dates and attachment parent boundaries

## Confirmed problem and fix

The retained authenticated `complete_occurrence` RPC called the closure engine
without Nest's completed-date validation. [Before-fix tests](before-fix.log) prove
that a new completion dated tomorrow succeeds. The second failure establishes
that the old engine reports a closed-occurrence error for a new invalid command,
rather than enforcing the required date boundary.

Migration `20261004143015_native_legacy_completion_dates.sql` rejects new null,
nonfinite, unsupported-year and future completed dates. It preserves the existing
closure/notification/recurrence engine, note/photo parameters and authenticated
membership enforcement. A current household member can still replay an already
committed legacy completion receipt with its original future date; the migration
does not update historical rows or create a replacement completion.

## Locally verified

- [Seven focused PostgreSQL tests](focused-tests.log), zero failures/skips: four
  new date/attribution/replay/authorization tests and three existing actual closure
  engine cases. Rejected writes preserve every occurrence, completion, receipt,
  activity, notice and reminder. Valid dates advance once with canonical actor
  attribution; retained future-date receipt/history remains byte-for-byte equal.
- [Full304-migration rehearsal](schema-probe.json), only the exact unavailable
  legacy pg_net declaration excluded. All prior retained-history, privacy, cutover,
  repair, epoch/AI command and committed-financial-recovery checks pass. This
  includes21 new rolled-back parent/date probes plus36 earlier calendar/search/
  usage and16 attachment cleanup/reservation probes. Security advisors run on the
  disposable socket and pass their error gate.
- The parent checks execute actual document/profile/completion triggers: partner,
  foreign tenant, forged creator, unaffiliated and anonymous claims are denied;
  receipt paths cannot masquerade as completion photos. A native receipt claimed
  only by a nonfinancial document stays uploader-private. Replacing its final
  document reference releases it to pending; a retained financial receipt remains
  claimed after the same document replacement.
- Current migration manifest covers55 legacy/250 native sources with exact hashes;
  all four manifest tests pass. Scoped formatting, lint and configured source
  limits pass without exemptions.

The initial full-chain observer omitted the required routine area and then tried
to call the private date helper as an authenticated caller. Both setup assumptions
were corrected before the actual date regression: the routine uses the existing
synthetic area and fixture setup binds the owner-computed household date without
granting additional permissions. The initially oversized verifier was split to
meet the80-code-line limit. No shipping permission or limit was weakened.

These proofs use real disposable PostgreSQL with synthetic actors and a Storage
metadata interface. They do not establish live Auth/Storage bytes, native execution,
VoiceOver/phones, all other legacy closure behavior or production compatibility.
The existing epoch/AI rehearsal proves database command execution, not live models.

## Hosted and CI status

Applied only to `nest-test`, hosted version `20261004144314`. The deployed function
body exactly matches the migration, keeps an empty search path and grants execution
to authenticated callers while denying anonymous callers. [Hosted proof](hosted-proof.json)
records unchanged complete52-event finance/ledger/allocation/attachment digests and
all five completions, occurrences and command receipts before and after the probes.

[Ten actual Auth/PostgREST negative probes](hosted-negative-probes.json) pass:
both members' new future/infinite/year10000/null dates return400/22023; an outsider
and anonymous caller cannot complete with a valid date. No successful hosted write
was attempted. Expired independent fictional verifier sessions stopped preflight
before any RPC, then were renewed without changing native Keychain sessions. An
initial read-only digest observer assumed an `id` column on completions; the actual
catalog's occurrence key corrected the query and the original digests match exactly.

[Exact-source CI](ci-results.json) passes `c5469baf`: Nest37210225147 and
Deep37210426388, with23 core,50 conflict and1,235 database/RLS cases, zero
failures/skips. Native sources are unchanged; no new native execution is claimed.
Hosted advisors remain61 informational policy-absence notices,81 privileged-function
warnings and one leaked-password warning; no findings were suppressed. Their
remediation links are retained in the hosted proof. Prior receipt-cleanup checkpoint
`1d67f235` also passes Nest37208513631.

This is a bounded review of the public completion RPC and its receipt parent paths.
Forty-nine other legacy public privileged functions and deeper private paths remain.
Existing security-advisor warnings are not suppressed. M1–M9 remain incomplete.
No production action, purchase, beta, merge or live AI enablement occurred.
