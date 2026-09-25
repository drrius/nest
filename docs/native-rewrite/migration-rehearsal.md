# Migration rehearsal evidence

The fixture-only schema diagnostic creates and destroys its own PostgreSQL cluster. It accepts a legacy migration directory, never a database URL. It reads each migration in lexical order, records its SHA-256 fingerprint and stops with a nonzero exit on the first failure. Source files are not copied or modified.

From the repository root:

```sh
NEST_TEST_PG_BIN=/path/to/postgres/bin node tools/migration/schema-probe.mjs /path/to/household-os/supabase/migrations
```

The strict run on 23 September 2026 applied 14 legacy migrations, then failed at `20260814153314_enable_pg_net.sql` because the local server lacks `pg_net`. The local server also does not establish the legacy hosted scheduler: legacy SQL catches unavailable `pg_cron` installation/scheduling errors. Successful SQL application alone cannot prove those jobs exist.

For an explicitly partial schema diagnostic, append `--without-pg-net`. That option skips only the named migration after checking that its entire trimmed content is the expected extension declaration. Changed content fails closed. The report always identifies the skipped source/hash and simulated infrastructure. `complete` means that this diagnostic finished, not that migration or release acceptance is complete.

The partial run applies **54 legacy migrations and all 194 native migrations**, with one legacy extension declaration excluded. Auth users/sessions/UID and Storage metadata tables are simulated infrastructure interfaces, not implementations of Supabase Auth, object bytes or Storage HTTP. No application migration functions are stubbed. All records are synthetic; the runner never connects to production.

## Current populated coverage

| Domain            | Evidence required by the diagnostic                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Financial history | Seven events, eight allocations and fourteen ledger entries retain full-row fingerprints, exact per-member balances, zero-sum pairs and household-qualified relationships. Includes all six event types and a legacy-confirmed recurring draft.                                                                                 |
| Receipt           | Claimed upload, object and private bucket metadata remain bound to the financial event; MIME and household must match.                                                                                                                                                                                                          |
| Groceries         | All four legacy states, two shopping sessions and two claims remain intact. Authorized native reads return only active/claimed items as unchecked, with original quantities and units. Open sessions are counted; no finish-shopping command runs.                                                                              |
| Recurring         | Active/inactive rules and pending/dismissed/posted drafts retain their rows. Authorized native readers retain the posted event link. No native mandate, cycle or adoption is inferred.                                                                                                                                          |
| Meals             | Saved recipe, ingredient, planned meal, linked leftovers and removed entry survive. Only additive native recipe fields are excluded from the legacy comparison. Authorized week reads expose the two active entries.                                                                                                            |
| Privacy           | Legacy digest preferences survive; native notification settings, calendar consent, memory and device registrations remain unconfigured.                                                                                                                                                                                         |
| Renewals          | Nine legacy commitments exercise valid conversion and retained/review-required cases. Reviewed source fingerprints fence changes. An unlinked active record converts through the shared authorized command; exact retry does not duplicate it. Invalid dates/titles, unknown callers and unadopted recurring links are refused. |
| Routines          | Alternating schedule, instructions, completed/skipped/current/preview occurrences, changed due date and completion note survive exactly. New native assignment fields retain safe defaults.                                                                                                                                     |
| Excluded modules  | Projects/trips, contacts, assets, bookings, documents, tasks, decisions/options, maintenance, asset-routine links, legacy calendar events and financial-context links retain counts and full-row fingerprints.                                                                                                                  |
| Document metadata | Upload/object/bucket metadata remains intact and valid. A rollback-only missing-object probe changes the snapshot and marks the reference invalid, then proves baseline restoration.                                                                                                                                            |

The routine and excluded-module extensions are locally verified and have review evidence recorded by commit in `docs/progress.md`; pending CI must not be inferred from this table. Standalone financial/receipt tests additionally exercise corruption rejection and incomplete-RLS-visibility rejection. Diagnostic JSON contains migration hashes, counts and outcomes, not a production export.

## Remaining acceptance gates

- Broader conversion integration and hosted verification. Linked conversion after explicit adoption, immutable provenance, injected-write rollback and concurrent retry now pass the synthetic diagnostic; exact merge evidence remains in the progress log.
- Real credential decryptability and native payload/bundle inspection. Synthetic connection ciphertext and remote event metadata now have fingerprint-preservation coverage, with no native consent created; this does not establish real credential usability.
- Representative authorized existing data, full relationship inventory, stable operation identities and actual stored-file bytes/access verification.
- A controlled old-writer fence, pending-command reconciliation, cutover and rollback rehearsal that preserves all newly posted financial history.
- Approved isolated Supabase execution with supported extensions, actual Auth/Storage interfaces, scheduler execution and provider verification.

These fixtures establish bounded synthetic preservation evidence. They do not establish complete migration acceptance, hosted scheduling, native/device behavior, production readiness or permission to perform cutover. Production execution remains separately gated.

For security advisors against the same disposable cluster, set `NEST_TEST_SUPABASE_BIN` to the installed Supabase executable. The runner derives a fixture-only Unix-socket URL and uses `db advisors --type security --fail-on error`. Missing configuration is reported as not run; requested advisor failures fail the diagnostic. The 54-legacy/190-native run returned no security findings on 23 September 2026. This is separate from hosted configuration and real Storage/Auth acceptance.

### Legacy grocery retention cutover rehearsal

The legacy `run_retain_purchased_groceries(text,integer)` function is an additional writer: its service-role invocation deletes purchased groceries and session-item history after 30 days. The disposable full-chain rehearsal reproduces one deletion using an aged synthetic row, then rolls the transaction back. A second rollback-only transaction revokes API-role execution and replaces the function with an explicit disabled error, proving that even an owner-run invocation cannot delete history. It verifies restoration of the exact function definition, ACLs, items and session-item rows after rollback.

This has no production activation entry point. The hosted `household-os-retain-purchased-groceries` cron job still requires inspection and explicit cutover handling; local `pg_cron` execution, running-job drainage and complete cutover are not verified by this fixture. Revoking API grants alone is insufficient for owner-run jobs.

### Legacy financial entry-point rehearsal

A rollback-only transaction revokes eight legacy public expense, contextual expense, refund, settlement, correction, opening-balance and draft decision RPCs from API roles. Actual authenticated invocations fail with insufficient privilege. Inside the same temporary restriction, the authorized native expense Save still reaches the audited ledger implementation through its existing private owner-executed wrapper. Exact retry returns the same receipt and creates only one financial event/receipt.

Rollback restores all public function ACLs, native expense receipts, retained financial rows/balances and receipt references. This verifies native compatibility with entry-point revocation. It does not fence every nested caller, legacy scheduler, direct table writer or in-flight transaction, and it does not implement production activation or rollback after post-cutover postings.

## Broad API restriction experiment

The disposable full-schema probe also runs the financial command/approval checks while revoking all API-role execution on non-native public functions/procedures and mutation grants on non-native public ordinary/partitioned tables and views. Effective inherited grants must be absent or the experiment fails. Function, table and column ACLs plus approvals and receipts are checked after rollback. This establishes expense compatibility only; it does not establish whole-app compatibility, cover other schemas, drain active transactions, stop owner-run jobs or authorize activation.

## Native automatic posting pause

The additive recovery control exposes only the owner-callable private function `nest_set_recurring_execution_paused(boolean)`. Pausing waits for shared locks held by automatic posting transactions; the pause transaction must commit before an operator treats it as acknowledged. A lock timeout is a failed pause, never a successful drain. Existing completed receipts remain readable. Resuming preserves each rule’s mandate and cursor rather than recreating financial events. This control does not stop legacy jobs, stop arbitrary owner SQL, or establish that every in-flight client command is drained. It is tested only in disposable fixtures and is not production activation authorization.

## Scheduled writer audit

[The scheduled writer audit](scheduled-writer-audit.md) identifies eight legacy source registrations, their effects and the evidence needed to retain, replace or stop each. This includes private Edge push invocation outside the public API fence. Source inventory does not establish live scheduler state or authorize changes.

## Committed recovery coverage — 25 September 2026

Unlike the rollback-only experiments above, the final fixture commits new records and then commits an API freeze. It preserves selected read-only recovery functions, pauses native automatic posting and eight known legacy job entry points, and checks retained history without restoring an older database image. `tools/migration/committed-recovery-freeze.mjs` is a helper for this caller-owned disposable fixture, not a production activation command.

| Path                                              | Current local proof                                                                                                                                                                                                          | Still outside this proof                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Chore and grocery checks                          | Original actor-only receipts survive; other actors cannot read them; new writes are refused; full routine history is retained. Separate real HTTP/SQLite tests recover lost responses under revoked mutation execution.      | Physical offline/restart and two-device journeys.                                                          |
| Direct expense, settlement, refund and correction | Real committed financial commands; exact owner receipt recovery; partner/outsider protection; revoked new writes. All-household financial comparison runs after recovery probes.                                             | Actual hosted Auth/Storage, device recovery, all cancellation/command variants.                            |
| Direct recurring setup, variable cycle and pause  | Real rule → due cycle → pause sequence, three exact private receipts, denied new saves/cancellations, complete rules/revisions/cycles retained.                                                                              | Fixed scheduler execution in the hosted environment, resume/manual-link variants and AI approval recovery. |
| Expense approval                                  | One explicitly confirmed proposal retains its consumed receipt; one pending proposal remains pending with no receipt. Partner/outsider reads and pending confirmation/execution are refused. Approval rows remain unchanged. | Other financial approval kinds, real model streaming and native confirmation/recovery.                     |

Settlement approval recovery additionally exercises consumed, denied and pending proposals in that synthetic household. The owner reads exact historical results after the freeze; partner/outsider reads and all confirmation/denial calls are refused. Complete approval rows and final financial snapshots remain unchanged. This covers settlement approvals only, not all remaining financial approval types.

The secondary settlement/adjustment/recurring household has independent synthetic members and valid new-command amounts. The original retained-history stress household, including its deliberately oversized balance, is preserved unchanged. No production household is read or modified. The latest combined local report is `/tmp/nest-settlement-approval-recovery.json`; reports in `/tmp` are local evidence, not durable release artifacts. Exact review/CI/merge state is recorded separately in `docs/progress.md`.

Completion still requires recovery or explicit reconciliation of every supported pending command, including other AI financial approvals, legacy draft/adoption flows, meal proposals, preference and household mutations, and attachment operations. It also requires a chosen cutover epoch, evidence that old clients cannot write through alternate paths, external-request drainage and actual scheduler state. Owner SQL, already dispatched HTTP and hosted infrastructure are not controlled by this fixture. `externalRequestsDrained`, `ownerJobsStopped` and `completeRecovery` deliberately remain false.
