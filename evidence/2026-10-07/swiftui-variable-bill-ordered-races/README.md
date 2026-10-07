# Ordered variable-bill Save and cancellation races

Both commit orders now have actual native session/API/PostgREST/PostgreSQL/SQLite
execution using synthetic data. Two ordered API cases and two signed native app
cases pass with zero failures or skips. [API results](api-tests.log),
[native results](native-summary.json).

The fixture inserts an after-insert gate into its own disposable receipt or
cancellation table. It observes the live gate holder and both RPCs waiting on
actual PostgreSQL advisory locks before releasing the holder. Cancellation-first
also holds the received Save at a loopback proxy until the cancellation transaction
owns the operation lock. Launch order or a random winning outcome is not the proof.

- Save first records one expense, cycle and receipt, no tombstone, two ledger rows
  and a zero ledger sum. Both native requests return the same recorded outcome.
- Cancellation first records one tombstone and no expense, cycle, receipt or
  ledger rows. The already sent Save is refused with a conflict. The native journal
  preserves the cancellation outcome.
- Native reopening of the actual SQLite store retains the exact command, operation
  identity, cancellation flag and terminal result. Retrying performs no second Save
  or cancellation request. Only explicit finish clears the terminal local slot.

The native test uses shipping SessionModel, MoneyAPI and local persistence with a
real HTTP transport to the existing Effect API, PostgREST and PostgreSQL fixture.
Authentication and initial chore/session discovery are controlled test adapters;
Apple sign-in, hosted Supabase and physical-phone behavior are not verified here.
The native integration is guarded and skips ordinary CI without its local fixture.
Routine CI now runs the two small API/database ordering cases.

The fixture stays on Linux loopback, exposed only through an owned encrypted SSH
tunnel to Mac loopback. A localhost-only HTTP exception is added solely to the
owned simulator build's Info.plist. Shipping HTTPS validation and configuration
are unchanged. [Source comparison](source-verification.json) records unchanged
shipping Swift files and exact executed test source hashes.

The initial native run failed twice before financial calls because the controlled
chore adapter mapped the synthetic token to the wrong member. Nest's identity
guard refused it. The test adapter now supplies its expected token only to that
controlled chore service; real financial requests keep their synthetic JWT and
go through actual API authorization/RLS. [Initial failures](initial-native-summary.json)
remain recorded. A preparation attempt also stopped before build on the Mac's
Python 3.9 tar-filter incompatibility; the corrected extractor validates regular
relative entries before extracting. No assertion or shipping guard is weakened.

Both separate owned simulators are deleted. Original actors, household scopes,
64 empty journals per client, display and private choices match before/after.
[Restoration](cleanup.json). The owned fixture and SSH tunnel stop; no matching
fixture PostgreSQL/PostgREST processes remain. [Process cleanup](process-cleanup.json).

No production or hosted test-household records, credentials, permissions, workers,
beta submission or existing financial history are changed. Build 22 remains stable.
The native screen gestures, hosted simultaneous race, live AI handoff and phone
acceptance remain separate gaps; M7 is not closed by these four local cases.

Source `a1aa923d` passes [routine CI](https://github.com/drrius/nest/actions/runs/37627414604)
and [native CI](https://github.com/drrius/nest/actions/runs/37627414734). The latter
reports 498 app tests, 56 guarded skips and zero failures. The guarded local
ordering methods skip there; their two actual Mac passes remain the native proof.
