# Retained calendar-sync boundaries

5 October 2026. Bounded M9 audit of five legacy public entry points:
`claim_calendar_sync`, `release_calendar_sync`, `reconcile_calendar_snapshot`,
`record_calendar_push` and `disconnect_calendar`, plus their private lease guard.
These retained shared-calendar paths are distinct from Nest's local personal
EventKit reads and sanitized busy blocks. No general calendar editing feature,
CalDAV runtime, real calendar credential or new native API is introduced.

## Executed disposable checks

The complete54-legacy/251-Nest migration chain applies in a fresh owned PostgreSQL
cluster. The exact `pg_net` declaration is explicitly excluded. Existing financial,
receipt, excluded-record and cutover-fence rehearsals also pass. The runner takes
no existing database URL. Auth and Storage are simulated; no scheduling or stored
byte claim follows from this run.

All92 [cases](cases.csv) pass:82 refusals and10 successful member flows.

- Each public entry refuses an authenticated foreign member, unaffiliated member,
  absent identity and anonymous role. Both household members are refused foreign
  and missing connections, even when they know a valid own-connection lease.
- Wrong/null/expired lease tokens refuse every leased entry. Active leases prevent
  another claim and disconnect. A valid own lease cannot acknowledge a foreign
  event. Direct invocation of the private guard is denied.
- Reconciliation refuses malformed/null snapshots, invalid recurrence types,
  duplicate entries and empty UIDs. These checks execute the actual retained
  function after all migrations, not an independently copied implementation.
- Both members can claim/release, reconcile their own snapshot, acknowledge their
  own event and disconnect. Expected lock/timestamp/event transitions are asserted;
  foreign calendar state, complete finance and native calendar consent/busy state
  remain unchanged inside these transactions.
- Exact snapshot/push repeats retain the complete state. Claim while active,
  release after release and disconnect after disconnect deliberately refuse.
  Those lease-based failures are not described as receipt-based native replay.
- Every probe rolls back. Complete original calendar connections/events, financial
  events/allocations/ledger and native privacy state equal their initial snapshot.
  Existing reconciliation preserves seven fixture events, eight allocations,
  fourteen ledger entries and one receipt reference; these are not hosted counts.

First harness attempts used the obsolete `member_id` snapshot ordering and tried
to store a PostgreSQL `void` result in a temporary column. Both were corrected
without changing a server function, permission or assertion. Scoped format/lint
and configured file/function/complexity limits pass; existing schema-probe Effect
Node-import warnings remain. No broad or native rerun is claimed for these tools.

```sh
NEST_TEST_PG_BIN=/path/to/postgresql/bin node tools/migration/schema-probe.mjs \
  /home/drrius/Work/household-os/supabase/migrations --without-pg-net
```

[Migration inputs](migration-inputs.csv) bind all305 applied migrations.
[Diagnostic inputs](diagnostic-inputs.csv) bind the changed runner/modules.
[Summary](schema-summary.json) records actual outcomes. Local PostgreSQL18.6 is
different from hosted PostgreSQL17.6; no PostgreSQL17 execution is claimed.

## Fresh hosted metadata and semantic guard review

One bounded SELECT against separate `nest-test` returns only six function hashes,
signatures, search paths, definer status and client ACLs. [Hosted results](hosted-functions.json)
exactly equal [compiled functions](compiled-functions.json). The five wrappers
and `private.require_calendar_lease` check actual `auth.uid()` and household
membership before returning/using the connection's lease or modifying records.
Acknowledgment additionally binds both household and connection on the event.
The helper requires a matching unexpired token and cannot be called by clients.
The fixed empty search path avoids caller-controlled object resolution.

Legacy membership authorizes both members of the shared old calendar; it is not
an owner-only personal-calendar policy. Its encrypted legacy credentials remain
retained and are not migrated into the native app. No raw function bodies, private
calendar details, real credentials or lease values are exported from hosted data.
Body/ACL matching is not a hosted member mutation or real CalDAV journey.

Eighteen other legacy public entry points and deeper private paths remain after
the prior23-entry checkpoint. Concurrent lease races, live external writers,
production migration, both-device Calendar privacy and full M9 remain unverified.
No advisor warning is suppressed. No hosted mutation, worker activation, model
call, native build, beta, production action, purchase, merge or automation occurs.
Shipping native source remains `f77d5846`, with routine/native CI already passing.
