# Retained routine definition boundaries

On 4 October 2026, the full compiled legacy/Nest migration chain passed 52
rolled-back definition checks: 46 refusals and six successful member flows.
Nine actual nest-test Auth/PostgREST refusals passed separately. No shipping
function or migration changed, and no successful hosted member mutation was sent.

## Audited entry points

- `public.create_routine`: verifies household membership, two-member capacity,
  title, schedule and assignment before creating a routine/window/activity.
  Composite tenant foreign keys constrain area, pet and assigned/rotation member.
  This primitive is **not idempotent**; the successful case calls it only once.
- `public.create_routine_once`: adds a household/key lock and a private receipt
  binding the actor and exact input. Changed payload and another actor cannot
  reuse the creation identity.
- `public.edit_routine_definition`: derives the household from the routine,
  requires membership, validates the patch whitelist and expected version, and
  serializes receipt/routine/window changes. An explicit null clears instructions
  without retaining the internal clear-intent row. Its historical edit receipt is
  household scoped, not an owner-private financial approval.
- `public.update_routine_definition`: the underlying unversioned primitive has
  no anonymous/authenticated execute grant. This extra revoked primitive is not
  another authenticated-executable advisor warning.

The deliberately read legacy sources are `20260809210000_routine_engine.sql`,
`20260905210500_routine_creation_retries.sql` and
`20260905002000_routine_edit_versions.sql`. The compiled chain includes Nest's
`20260926102144_native_preparation_nonretryable_conflicts.sql` edit patch; raw
historical bodies alone would not establish current behavior.

## Actual verification

```sh
NEST_TEST_PG_BIN=/tmp/nest-postgres/usr/bin node tools/migration/schema-probe.mjs \
  /home/drrius/Work/household-os/supabase/migrations --without-pg-net
```

This creates and cleans its own disposable PostgreSQL cluster. All 305 migrations
apply (54 legacy, 251 Nest); only the exact pg_net enable declaration is excluded.
Input hashes/status are retained in [migration-inputs.csv](migration-inputs.csv).
The [schema summary](schema-summary.json) records actual diagnostic assertions and
limitations, not a claim that scheduling or cutover is complete.

Both members exercise foreign area/pet/assignee/rotation rejection, tenant patch
injection, revoked primitive access, creation, exact creation replay, changed/other
actor creation identity, exact versioned edit replay, instruction clearing and
stale edits. Foreign, unaffiliated, absent and anonymous identities are refused.
[Denied cases](denied-cases.json) and [member flows](member-cases.json) retain all
52 results. All original routine/window/completion/receipt/clear-intent/activity/
reminder/notice/financial/ledger rows remain equal after rollback.

Four hosted trimmed-body SHA256 values, definer/search-path metadata and anonymous/
authenticated execute privileges match the compiled chain.
[Hosted probes](hosted-denied-probes.json) record six outsider/anonymous refusals
for the public entry points and three member/anonymous refusals for the revoked
primitive. Independent session preflights passed before these requests. All nine
returned 401/403 with SQLSTATE42501. No credential or token is retained here.

[Hosted proof](hosted-proof.json) records equal before/after metadata and digests:
19 routines, five completions, occurrence/command receipts, all52 financial events,
ledger, allocations and attachment references. Fresh advisors remain61INFO,
81 authenticated-definer WARN and one leaked-password WARN, with remediation
links; none is suppressed. This bounded review covers three more legacy warning
entries, leaving41 other public legacy entries and deeper private paths open.

Exact-source routine [CI37219093738](https://github.com/drrius/nest/actions/runs/37219093738) passes at `a8928b51`. These52 new full-chain cases were executed locally, not by that routine workflow. Focused Oxfmt/Oxlint/source checks pass. Existing schema-probe filesystem/path
Effect warnings remain visible. An initial sandbox child-start error occurred
before database execution; the authorized fresh isolated execution then passed.
The artifact exporter initially assumed all older diagnostic groups had a
`passed` field. It was corrected using the completed report without rerunning
database or hosted commands. [Tool hashes](source-inputs.json) identify the source.

## Verification limits

Local Auth/Storage scaffolding is simulated; hosted probes use actual Auth and
PostgREST. Local security-advisor CLI execution is unavailable. Body/client-grant
parity does not establish ownership/service-role grant parity or complete nested
private-function coverage. No new deep CI, native execution, provider call,
calendar/Storage byte execution, timer activation, production access, release or
merge is claimed. M9 remains incomplete.
