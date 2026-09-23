# Migration rehearsal evidence

The fixture-only schema diagnostic creates and destroys its own PostgreSQL cluster. It accepts a legacy migration directory, never a database URL. It reads each migration in lexical order, records its SHA-256 fingerprint and stops with a nonzero exit on the first failure. Source files are not copied or modified.

From the repository root:

```sh
NEST_TEST_PG_BIN=/path/to/postgres/bin node tools/migration/schema-probe.mjs /path/to/household-os/supabase/migrations
```

The strict run on 23 September 2026 applied 14 legacy migrations, then failed at `20260814153314_enable_pg_net.sql` because the local server lacks `pg_net`. The local server also does not establish the legacy hosted scheduler: legacy SQL catches unavailable `pg_cron` installation/scheduling errors. Successful SQL application alone cannot prove those jobs exist.

For an explicitly partial schema diagnostic, append `--without-pg-net`. That option skips only the named migration after checking that its entire trimmed content is the expected extension declaration. Changed content fails closed. The report always identifies the skipped source/hash and simulated infrastructure. `complete` means that this diagnostic finished, not that migration or release acceptance is complete.

The partial run applied **54 legacy migrations and all 188 native migrations**, with one legacy extension declaration excluded. Auth users/sessions/UID and Storage metadata tables are infrastructure interfaces, not implementations of Supabase Auth, object bytes or Storage HTTP. No application migration functions are stubbed. The initial run used an empty application dataset. The runner now seeds a synthetic household and retained six-kind financial history before the native sequence, then requires financial and receipt reconciliation to pass. The populated run preserved six events, six allocations, twelve ledger rows, exact per-member balances and one claimed receipt reference across all 188 native migrations. It does not establish preservation of other product data or full product behavior.

Separate financial/receipt fixture tests cover retained row fingerprints, exact balances, household-qualified relationships, claimed receipt ownership/private metadata, and corruption rejection. Full rehearsal still requires representative household data across chores, meals, groceries, recurring rules and retained excluded modules; exact mappings and reconciliation; old-writer cutover and rollback; actual Auth/Storage/provider verification; and approved isolated-backend execution with supported extensions. Production execution remains separately gated.

The populated fixture also includes all four legacy grocery states, two shopping sessions and two claim rows. Exact legacy projections must remain unchanged, including purchased/removed history. The authorized native read must return only the active/claimed items as unchecked, preserving quantities and units. The report counts open legacy sessions for cutover follow-up; it does not invoke legacy finish-shopping commands.

Legacy recurring coverage includes active/inactive monthly rules and pending/dismissed drafts. Their exact rows survive the native sequence, both rules remain available through the authorized legacy inventory, and no native mandate, cycle or adoption is created. Posted recurring draft linkage and explicit cutover/rollback still need representative rehearsal.

Posted recurring linkage is now also exercised: the legacy authenticated confirmation command posts a third draft before native migrations. Exact history reconciliation and the native authorized draft reader must retain its financial-event ID. The expanded fixture contains seven events, eight allocations and fourteen ledger entries. Cutover and rollback remain separate outstanding gates.

Meal coverage now preserves a saved recipe, quantified ingredient, planned meal, linked leftovers and removed entry. Only the explicitly additive recipe fields are excluded from legacy-row comparison. The authenticated native week read must contain exactly the two active entries while retained removed history remains in storage.
