# Current-chain fixture rehearsal

The full current chain initially refused the cutover freeze because three later private tables had no statement write guard: `nest_routine_creation_cancellations`, `nest_ai_cancelled_turns` and `nest_apns_delivery_attempts`. The unchanged control failed closed; no freeze was acknowledged.

Additive migration `20260930012204_native_recent_journal_write_barriers.sql` installs the existing barrier on those tables with `ENABLE ALWAYS`, enables RLS on both cancellation journals and revokes direct API-role access. It neither freezes writes nor changes stored records. Existing migrations are unchanged.

[The complete synthetic report](report.json) records every source/hash, all 54 applied legacy and 244 native migrations, the one explicitly excluded `pg_net` extension declaration, reconciliation and recovery results. The executable runner accepts a migration directory and creates its own disposable cluster; it cannot target an existing database URL. Production was neither read nor modified.

Verification:

- Six real PostgreSQL barrier cases pass with no skips (`/tmp/nest-recent-journal-barrier-tests-20260930.log`). The new case first reproduces the missing-guard refusal, then checks all three tables: direct API-role privileges denied, RLS enabled, inserts/updates/deletes/truncates blocked while frozen even under replica mode, old rows unchanged and new writes permitted after explicit resume. Minimal test journal rows isolate statement protection; the full rehearsal uses actual application DDL.
- The complete-chain rehearsal passes (`/tmp/nest-current-apns-chain-fixed-20260930.json`). Original seven events/eight allocations/fourteen ledger entries/one receipt reference retain exact reconciliation before and after cutover. Committed financial recovery, offline snapshots and private journals remain preserved within the report's existing bounds.
- Local Supabase CLI 2.113.0 security advisors run against only the disposable socket: zero findings, error gate passed.
- Affected actual HTTP/PostgREST/APNs loopback integrations are recorded separately in the progress log. No Apple provider was contacted.

Reproduce from the repository root with the installed PostgreSQL and Supabase CLI binaries:

```sh
NEST_TEST_PG_BIN=/path/to/postgres/bin NEST_TEST_SUPABASE_BIN=/path/to/supabase \
  node tools/migration/schema-probe.mjs /path/to/household-os/supabase/migrations --without-pg-net
NEST_TEST_PG_BIN=/path/to/postgres/bin node --test tests/database/cutover-write-barrier.test.mjs
```

`complete` means this diagnostic finished. Auth/Storage interfaces remain synthetic; real object bytes, schedules and external writer/client-intent drainage are not verified. `completeRecovery`, `externalRequestsDrained` and `ownerJobsStopped` remain false. No hosted migration, worker activation, production cutover or release occurred in this rehearsal.
