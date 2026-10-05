# Two native grocery clients — 5 October 2026

Two owned SE3/iOS26.3.1 simulators use independently authenticated fictional
Test Alex and Test Sam sessions against the real, separate nest-test API. The
new partner simulator started at the ordinary signed-out gate and received its
own guarded operator SDK login. No simulator or Keychain was cloned. This login
is test setup, not a shipping password feature or Apple sign-in verification.

The ordinary native Profile, Today and Groceries controls establish both roles.
Real typed native reads verify membership and the one named item. The native
fixture methods skip without explicit opt-in, exact owned simulator/role and
action gates; they are forbidden on physical phones. The read adapter also
checks both test origins and disabled push before using the real credentials.

## Verified behavior

- Five initial native methods pass both-member readiness and empty journals.
- One native Add creates exactly one item at version1. Creation is not repeated.
- A queued checkbox survives restart with the same operation and raw-body hash.
  B's real native save advances to version2. A's replay returns already_applied
  at version2; both SDK clients read the same checked item and empty journals.
- A second queued intent retains version3 while B's native check/uncheck advances
  the item through versions4/5. A's stale replay becomes a reviewable conflict;
  its original intent/hash survive. Explicit native Discard leaves canonical
  version5 unchecked, independently read by both accounts.
- A third native checkbox commits at version6, but the relay drops its reply and
  blocks A. The pending command survives restart unchanged. Reconnection replays
  the same operation and returns the exact original receipt, without advancing
  the version. Both native clients read version6 checked.
- At this known, cleared checkpoint, one deliberate uncheck/check cycle verifies
  the corrected native observer at versions7/8. Both reads agree afterward.
- Native Remove retains the item as removed/version9; both real lists exclude
  it. Both ordinary apps return to Today on the stable test origins, large/light,
  with their original identities and all64 command journals empty.

All six complete financial/activity/Storage fingerprints are unchanged:62
financial events,104 allocations,124 ledger rows,112 activity rows,two objects
and one bucket. The claimed PDF and existing financial history remain intact.
[Retention](fingerprints.json), [journal hashes](journal-evidence.json),
[real relay receipts](relay-evidence.json).

## Failures retained and corrected observers

The49 native executions contain46 passes,three failures and zero skips. This is
not an all-green run. All three failures occur after confirmed real saves:
the first Add checks sheet disappearance immediately; two online checkbox cases
wait for a row after it moves into the checked section. The recording of the
latter shows the expanded section with the named row below the viewport. The
observer now waits for transition, expands when needed and reveals the target.
Its subsequent complete native online-check method passes at version8.

The Add observer now waits for dismissal, but its whole creation method has not
been rerun with the same fixture; no creation pass is claimed. Separately, one
controller stopped on a variable collision before replay. Independent JSON
comparison confirms both saved journal snapshots were actually identical.
The collision was corrected; the retained request and confirmed saves were
not recreated or retoggled to manufacture a green result.

[Initial readiness](warm-native-results.json),
[earlier attempts](early-native-results.json),
[final continuation](final-native-results.json),
[source, controller and restoration metadata](verification.json).

## Verification boundaries

The loopback-only HTTPS relay forwards real authenticated data and commands,
restricting writes to checkbox operations on this exact item. Its controlled503
responses and dropped TCP reply exercise API unavailability; no radio was turned
off and no canonical data response was fabricated. Authorization headers/bodies
are not logged. Four successive stopped controllers generated two-day localhost
certificate pairs trusted only on these two owned simulators. Every generated
private key is destroyed; the public trust entries are left to expire, preserving
the normal Keychains. The Mac system trust store is untouched. The final relay
is stopped and the private override removed; stable app metadata is verified on restoration.

All792 app/AppTests/UITests/project inputs match the final observer source,
SHA256 `95c6beed19e4e72c053bdfd978446fd4255c35ca133968e5a0cb7a6fcb62433b`.
Earlier per-phase hashes remain recorded; only the manual UI test differs across
those phases. Strict touched Swift formatting and source limits pass. Source
1075f60c passes both CI workflows:496 Foundation/41 skips and423 signed-native/14
skips, zero failures, including actual push-disabled signing. That routine run
does not execute this manual fixture. The newer observer source is locally
verified; its next CI gate remains pending at capture. [CI metadata](source-ci.json).

Physical radio loss, VoiceOver, maximum text/dark variants, both phones, broader
chores/handovers and full M4 acceptance remain open. This adds guarded tests, not
shipping UI changes. No financial posting, model call, new beta, purchase,
production change, release, main update or merge occurred.
