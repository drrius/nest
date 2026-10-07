# Migration runtime owner

The disposable rehearsal now applies migrations as a separate administrative
owner and lowers that owner to NOSUPERUSER before running behavioral checks.
Its measured role flags match the [nest-test observation](../migration-owner-roles/README.md).
Auth/Storage ownership and API-role membership remain simulated. This does not
prove hosted permission equivalence, hosted migration execution or production readiness.

## Verification

- The corrected full rehearsal applies 54 legacy and 257 native migrations.
  All runtime check groups finish and both financial reconciliations pass.
  The existing pg_net declaration exclusion remains explicit in summary.json.
- Seven focused fixture/runtime/lifecycle checks pass, with zero failures or skips.
  The new runtime test proves authenticated direct reads obey RLS, an authorized
  non-superuser definer retains its intended RLS bypass, anonymous execution is
  refused and the lowered owner cannot create a superuser.
- Session authorization keeps RESET ROLE at the intended fixture owner. The
  separate bootstrap channel only provisions and cleans up the disposable cluster.
- The first attempt to lower PostgreSQL's bootstrap user was rejected because
  the bootstrap superuser must retain SUPERUSER. A separate owner fixes that.
- The first separate-owner rehearsal failed on public-schema CREATE permission.
  The corrected fixture grants public USAGE/CREATE, matching the observed hosted
  schema privileges. The sanitized failure is retained in initial-failure.json.

The full rehearsal was repeated for this newly changed privilege dimension.
Its complete result is summarized in summary.json with source and raw-report
hashes. No hosted role, production data, registered job or shipping client changed.
Fixture shutdown completed. Native verification is unchanged and this needs no
new phone build.

Run the focused checks with a local disposable PostgreSQL installation:

```sh
NEST_TEST_PG_BIN=/path/to/postgres/bin node --test \
  tests/database/fixture-runtime-owner.test.mjs \
  tests/database/fixture-postgres.test.mjs \
  tests/database/fixture-lifecycle.test.mjs
```

Run the bounded fixture rehearsal:

```sh
NEST_TEST_PG_BIN=/path/to/postgres/bin node tools/migration/schema-probe.mjs \
  /home/drrius/Work/household-os/supabase/migrations --without-pg-net
```

Compilation still uses administrative privileges. Auth/Storage grants, private
function dependencies, actual scheduled execution, external writers and existing
production data remain separate acceptance requirements.
