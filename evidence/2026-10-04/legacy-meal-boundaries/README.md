# Legacy meal authorization and retry review — 4 October 2026

This is bounded M9 verification of seven retained public commands:
`create_and_place_meal`, `place_meal`, `update_meal_plan_entry`,
`move_meal_plan_entry`, `remove_meal_plan_entry`, `create_meal_preparation`,
and `save_planned_meal_to_library`. It changes diagnostic tooling only.
No migration, grant, shipping client, provider, scheduler or production setting
was changed. Native execution is not claimed.

## Disposable PostgreSQL evidence

The complete current chain applies 305 migrations: 54 audited legacy and 251
Nest migrations. Only the exact `pg_net` extension declaration is explicitly
excluded. Auth and Storage interfaces are simulated; the actual compiled
PostgreSQL functions execute. [Migration inputs](migration-inputs.csv) and
[source hashes](source-inputs.json) bind the final report.

The [summary](schema-summary.json) indexes all 130 cases. Each runs in an isolated
transaction and rolls back. Both members are exercised. Coverage includes:

- Foreign-household, unaffiliated and missing identities; anonymous execution;
  and a member targeting another household's recipe or meal entry.
- Foreign library and leftover sources, removed meals, leftover chains,
  invalid names/slots/links, foreign preparation areas and assignees, and
  conflicting library identities. Source/leftover date ordering remains enforced.
- Both members' successful commands, exact retries and unchanged complete state
  after retries. Counts assert one new meal/recipe/preparation where appropriate,
  and the expected receipt count, with no duplicated chores or groceries.
- Populated library placement adds one correctly linked 250 g ingredient once.
  Leftovers retain the recipe/source relationship and add no groceries.
- Changed receipt payloads are rejected for all six receipt-based commands;
  an outsider cannot retrieve any historical successful result.
- Recipe saving uses the source link as its legacy retry record: a competing
  save returns the existing recipe without changing it. This is explicitly
  different from an exact-payload receipt.

All original meal/recipe/ingredient, grocery, routine/occurrence/completion,
receipt, activity/reminder, week/library revision and financial/ledger/allocation
rows remain equal after the probes. Existing pre/post-cutover financial fixture
reconciliation also passes.

Run:

```sh
NEST_TEST_PG_BIN=/tmp/nest-postgres/usr/bin node tools/migration/schema-probe.mjs \
  /home/drrius/Work/household-os/supabase/migrations --without-pg-net
```

The first attempt stopped because the harness date argument called a revoked
private helper. It was replaced with a caller-safe PostgreSQL date expression;
no server permission was relaxed. Final focused/full lint and format checks
pass, with existing Effect warnings retained. File/function/complexity limits
pass without exceptions. Source `3abe3df7` passes
[routine CI37234581666](https://github.com/drrius/nest/actions/runs/37234581666).
The full populated rehearsal runs locally rather than on every branch push.

## Hosted isolated test evidence

[Hosted definitions](hosted-functions.json) equal the seven
[compiled definitions](compiled-functions.json), including body SHA256, signature,
fixed empty search path, definer status and client grants. Anonymous execution
is denied; authenticated execution remains enabled subject to membership checks.

After read-only identity/session checks, fourteen real Auth/PostgREST requests
from the existing fictional outsider or anonymous caller return 401/403 with
SQLSTATE 42501. [Denial results](hosted-denials.json) omit tokens and payloads.
No successful member mutation was attempted. Expired independent verifier
sessions were renewed only for the three known fictional identities; native
Keychain and owner sessions were unchanged.

[Before](retained-before.json) and [after](retained-after.json) snapshots are
identical under the [retention query](retention-query.sql): 55 meal entries,
7 legacy recipe definitions, 11 ingredients, 28 groceries, 19 routines,
24 occurrences, no legacy meal receipts, 58 financial events, 116 ledger rows
and 98 allocations. These are current table inventories, not app screen counts.
Storage bytes and push delivery are not part of this review.

## Limits

Legacy library placement automatically materializes groceries. This evidence
does not claim Nest's separately approved ingredient workflow is satisfied by
that legacy behavior. Competing edits and cutover drainage still need their
own native/current-command evidence; successful local calls are not successful
hosted member or phone journeys. Live AI remains unavailable.

Thirty other legacy public entry points and deeper private reachable helpers
remain to review. Existing privileged-function advisor warnings are not
suppressed. M9 and all broader acceptance gates remain incomplete. Shipping
SwiftUI source is unchanged from the previously verified `6c05bdb4`.
