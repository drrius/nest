# Migration rehearsal evidence

The fixture-only schema diagnostic creates and destroys its own PostgreSQL cluster. It accepts a legacy migration directory, never a database URL. It reads each migration in lexical order, records its SHA-256 fingerprint and stops with a nonzero exit on the first failure. Source files are not copied or modified.

From the repository root:

```sh
NEST_TEST_PG_BIN=/path/to/postgres/bin node tools/migration/schema-probe.mjs /path/to/household-os/supabase/migrations
```

The strict run on 23 September 2026 applied 14 legacy migrations, then failed at `20260814153314_enable_pg_net.sql` because the local server lacks `pg_net`. The local server also does not establish the legacy hosted scheduler: legacy SQL catches unavailable `pg_cron` installation/scheduling errors. Successful SQL application alone cannot prove those jobs exist.

For an explicitly partial schema diagnostic, append `--without-pg-net`. That option skips only the named migration after checking that its entire trimmed content is the expected extension declaration. Changed content fails closed. The report always identifies the skipped source/hash and simulated infrastructure. `complete` means that this diagnostic finished, not that migration or release acceptance is complete.

The partial run applies **54 legacy migrations and all 190 native migrations**, with one legacy extension declaration excluded. Auth users/sessions/UID and Storage metadata tables are simulated infrastructure interfaces, not implementations of Supabase Auth, object bytes or Storage HTTP. No application migration functions are stubbed. All records are synthetic; the runner never connects to production.

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
