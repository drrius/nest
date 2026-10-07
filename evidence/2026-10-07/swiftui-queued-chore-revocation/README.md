# Queued chore membership loss

One selected signed-native SessionModel test passes with isolated SQLite and
controlled authentication/HTTP. A chore queues during an API outage. Reconnection
refuses completion and fresh membership, after which the app reports notMember,
hides Today and clears its active lease. No successful completion reaches the
controlled chore server. A restarted model again refuses membership and does not
retry the queue. Explicit test-only local inspection compares the retained command's
canonical encoded bytes with the original, then deactivates that inspection lease.

[Result](result.json) records one pass, zero failures/skips and zero hosted writes.
The [initial result](initial-result.json) records a compile failure before any test
execution because CompleteChore has no Equatable conformance. The test now compares
complete canonical payloads; shipping types and authorization behavior are unchanged.
[Source](source.json) identifies the formatted test.

Both original simulator actors/household,64 empty journals, settings and privacy
choices restore; [restoration](restoration.json). Source limits and actual signed
execution pass. Current-head CI remains pending. This does not prove actual hosted
membership removal, rendered revocation guidance, real token expiry, physical
radio behavior or both-phone acceptance. No real member is removed.
