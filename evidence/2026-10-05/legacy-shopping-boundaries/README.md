# Retained shopping authorization — 5 October 2026

Bounded M9 review of seven retained public commands: `start_shopping_session`,
`claim_grocery_item`, `release_grocery_item`, `remove_grocery_item`,
`merge_grocery_items`, `cancel_shopping_session` and `finish_shopping_session`.
These are compatibility paths pending approved cutover, not new Nest features.
Only disposable diagnostic tooling changes. No migration, grant, hosted row,
production setting, worker, provider, native binary or release changes.

## Actual disposable execution

The full current chain applies 54 audited legacy and 251 Nest migrations.
Only the exact `pg_net` declaration is explicitly excluded.
[Migration hashes](migration-inputs.csv) and [diagnostic hashes](diagnostic-inputs.csv)
bind the executable report. PostgreSQL18.6 executes real functions/constraints;
Auth/Storage interfaces are simulated. Hosted nest-test uses PostgreSQL17.6.1.166.
This is not a PostgreSQL17 execution claim.

All [133 cases](cases.csv) pass:115 refusals and18 member flows. Each runs in a
separate transaction and rolls back. Coverage includes:

- Foreign-household, unaffiliated and absent identities; anonymous execution;
  both members targeting foreign items/sessions and partner-owned sessions.
- Foreign categories/payers, terminal items, another session's claims, finished
  sessions, cancellation after purchase and invalid names/order/centimes.
- Both members' existing/new sessions, claim/release/removal, merge, cancellation
  and purchase completion. Exact retries preserve full grocery/session/claim/
  receipt/draft/activity/financial state.
- Merge/finish return the exact stored result and reject changed payloads.
  State retries truthfully return `changed:false` or zero released items;
  these responses need not equal the first result. New-session retries retain
  the same session ID with `existing:true`.
- Optional purchase handling creates exactly one pending expense draft.
  Receipt total3 centimes and shared amount1 centime are separate inputs.
  Neither this path nor ordinary completion changes financial events, ledger
  entries or allocations. Draft creation is not financial approval.
- An outsider cannot retrieve historical successful results.

Original rows remain exactly equal after all rolled-back probes. Existing
pre/post-cutover fixture reconciliation passes: seven events, eight allocations,
fourteen ledger entries and one receipt reference. These are fixture counts,
not the hosted household inventory. The existing shopping fence rehearsal also
completes: all seven old commands/direct session-item-claim writers are blocked
while native check/retry remains usable, then all grants/data are rolled back.
No fence is activated.

```sh
NEST_TEST_PG_BIN=/path/to/postgresql/bin node tools/migration/schema-probe.mjs \
  /home/drrius/Work/household-os/supabase/migrations --without-pg-net
```

The runner creates its own cluster and accepts no existing database URL.
Initially missing `psql` was supplied by extracting the matching package locally,
without system installation. Fixture attempts omitted explicit sort values and
miscounted JSON null as an array; both harness issues were corrected before the
passing run. No server permission was relaxed. Focused format/lint and file/
function/complexity limits pass; existing Effect Node-import warnings remain.
Exact diagnostic source80447fed passes [routine CI37271758517](https://github.com/drrius/nest/actions/runs/37271758517). No native source changes, so the last shipping
SwiftUI checks remain the exact d6189131 runs.
No fresh local advisor run is claimed: a Supabase CLI is not configured.

## Hosted read-only definitions and delegated guards

Fresh metadata identifies the existing nest-test project. Seven
[hosted public functions](hosted-functions.json) and two
[hosted helpers](hosted-helpers.json) exactly match compiled bodies, signatures,
empty fixed search paths, definer status and client grants. Only SELECT catalog
queries run; no Auth login or member mutation is attempted. Definition matching
is not a hosted authorization journey.

Public wrappers check actual `auth.uid()`/household membership before side
effects or historical receipt lookup. Session commands additionally require its
owner; household membership does not grant use of a partner's session.
`private.is_household_member` reads membership, not user-editable metadata.
The receipt helper locks household/key and checks command kind/exact payload.
Anonymous/authenticated roles cannot execute it directly; authorized wrappers
own invocation. The composite household/category constraint also rejects a
foreign merge category.

## Remaining acceptance

Twenty-three other legacy public entry points and deeper private paths remain
to review. No advisor finding is dismissed merely because hashes/grants match.
Concurrent legacy execution, hosted Auth/Storage journeys, external writers,
production migration and full M9 acceptance remain unverified. Live AI and
both-phone acceptance stay separate. Shipping SwiftUI is unchanged at d6189131.
