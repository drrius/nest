# Prepared internal-table RLS

The new migration enables RLS on the ten internal receipt, operation and execution-control tables identified in the prior test-project inventory. It adds no grants or policies and does not force RLS on trusted owners. These tables remain accessible only through their existing authorized commands or trusted database roles.

Two focused PostgreSQL tests pass. Representative populated rows stay hidden from both client roles even after simulated accidental SELECT/INSERT/UPDATE/DELETE grants: reads return zero rows, inserts fail RLS and updates/deletes affect nothing. Existing rows and grants are unchanged; trusted owner/service access remains. Reapplying the migration is safe. These focused rows test RLS behavior, not the actual command schemas.

The separate real-schema rehearsal applies54 legacy and257 native migrations, with one exact pg_net extension declaration excluded. Its independent catalog check confirms all ten actual tables have RLS enabled, zero policies and no client row/TRUNCATE privileges. Existing domain, authorization, pending-job, recovery and cutover checks pass. Financial reconciliation preserves seven events, eight allocations, fourteen ledger rows and one receipt reference before and after. Local Supabase security advisors ran and passed their error gate; their empty result does not clear the hosted project's earlier warnings.

Four migration-manifest tests pass with55 legacy/257 native entries and exact hashes. Scoped formatting/lint/source limits pass, with the schema probe's two pre-existing Effect Node-import warnings. [Report](full-chain.json), [source hashes](source-inputs.json), [verification and limitations](verification.json).

The CLI-created migration used the checksum-verified official Supabase CLI2.119.0. The [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) describes grants and row policies as separate controls; no broad client policy was introduced. The current [PostgreSQL minor-release notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) was checked. This change uses ordinary RLS statements, with no extension, encryption or custom-operator changes.

This is prepared source and disposable PostgreSQL18.6 verification. Auth/Storage remain simulated; hosted grants/RLS, real service writers, external drainage and production acceptance are unverified. No hosted or production migration, financial write, worker activation, provider call, release or merge occurred.
