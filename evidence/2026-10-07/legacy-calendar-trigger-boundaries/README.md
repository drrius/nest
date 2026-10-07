# Retained calendar trigger boundaries

Twenty-seven actual rolled-back PostgreSQL cases pass through the current chain of
54 legacy and 257 Nest migrations. This extends the public RPC review to the two
private invoker triggers, `guard_calendar_connection` and `guard_calendar_event_sync`.
No production or hosted mutation occurs.

Both members can change unlocked connection read-only state and edit their household
event. Event edits retain the remote acknowledgment, clear stale rendered iCal data,
retain the original edit base and become pending for sync. Active leases prevent
credential and read-only changes. A different selected calendar requires disconnect.
Connection identity changes, forged remote acknowledgments/baselines, detachment and
client acknowledgment of pending edits are refused by actual grants or trigger guards.

Direct updates of known foreign event/connection IDs affect zero rows for both
members and an unaffiliated actor, proving the fixture's RLS boundary. Both helpers
reject ordinary authenticated SELECT invocation because they are trigger functions.
Anonymous has EXECUTE but lacks private-schema USAGE and cannot invoke either.
The original complete calendar rows remain exact after every transaction rolls back;
the broader rehearsal preserves full financial and receipt reconciliation.
[Actual report](schema-report.json).

A read-only nest-test catalog query verifies both invoker flags, empty search paths,
anonymous EXECUTE and absent anonymous schema USAGE. Both exact hosted body hashes
match the sole legacy source definitions; no later Nest migration redefines them.
[Comparison](source-body-comparison.json), [query](hosted-function-query.sql),
[hosted functions](hosted-functions.json). Body parity supplements, but does not
replace, the real disposable SQL execution. Hosted direct mutation, bearer HTTP,
CalDAV credentials/network and personal EventKit behavior are not tested here.

The first 24-case rehearsal passes before foreign direct-update cases are added.
A max-params lint violation in its helper is fixed using an options object before the
final 27-case execution. Source limits are not disabled. Scoped lint passes; the
schema runner retains its two existing Effect Node-import warnings. These tests are
in the separate full-chain rehearsal, keeping routine CI fast.

Legacy shared calendar remains reference/migration data, not a new Nest feature.
Private call chains, trusted service writers, Storage and external old-client
shutdown/cutover acceptance remain open. No permission grant, native execution,
provider call, scheduler, release, merge or automation occurs.
