# Migration rehearsal evidence

The fixture-only schema diagnostic creates and destroys its own PostgreSQL cluster. It accepts a legacy migration directory, never a database URL. It reads each migration in lexical order, records its SHA-256 fingerprint and stops with a nonzero exit on the first failure. Source files are not copied or modified.

From the repository root:

```sh
NEST_TEST_PG_BIN=/path/to/postgres/bin node tools/migration/schema-probe.mjs /path/to/household-os/supabase/migrations
```

The strict run on 23 September 2026 applied 14 legacy migrations, then failed at `20260814153314_enable_pg_net.sql` because the local server lacks `pg_net`. The local server also does not establish the legacy hosted scheduler: legacy SQL catches unavailable `pg_cron` installation/scheduling errors. Successful SQL application alone cannot prove those jobs exist.

For an explicitly partial schema diagnostic, append `--without-pg-net`. That option skips only the named migration after checking that its entire trimmed content is the expected extension declaration. Changed content fails closed. The report always identifies the skipped source/hash and simulated infrastructure. `complete` means that this diagnostic finished, not that migration or release acceptance is complete.

The partial run applied **54 legacy migrations and all 188 native migrations**, with one legacy extension declaration excluded. Auth users/sessions/UID and Storage metadata tables are infrastructure interfaces, not implementations of Supabase Auth, object bytes or Storage HTTP. No application migration functions are stubbed. This run has an empty application dataset and therefore does not prove data preservation or product behavior.

Separate financial/receipt fixture tests cover retained row fingerprints, exact balances, household-qualified relationships, claimed receipt ownership/private metadata, and corruption rejection. Full rehearsal still requires representative household data across chores, meals, groceries, recurring rules and retained excluded modules; exact mappings and reconciliation; old-writer cutover and rollback; actual Auth/Storage/provider verification; and approved isolated-backend execution with supported extensions. Production execution remains separately gated.
