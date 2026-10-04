# Native handover acceptance and saved-request recovery

Verified4 October2026 on the authorized Mac's owned375×667 iOS26.3 simulator, using only two fictional one-off chores in the separate Nest test project. Production was untouched.

## Proven behavior

- Final-sheet incoming acceptance names the chosen chore/date. Cancel dismisses without staging at ordinary and largest text/dark;44pt corner targets work. One positive acceptance moves only that responsibility, and both test members independently agree.
- Outgoing request review names the chosen chore/date and explains that responsibility remains with the sender until acceptance. Cancel does not stage. One Send commits upstream with its reply deliberately dropped.
- The actual native SQLite request survives process restart with API access unavailable. The partner accepts using their authenticated account before the sender recovers. Sender/outsider acceptance returns403; anonymous acceptance returns401.
- One explicit native retry sends exactly the saved operation and payload, receives the original request receipt, and preserves the already accepted assignee. Both current snapshots have no pending handover. Both complete51-event financial histories and exact centime balances are unchanged.
- An actual rendered finding was fixed: the original immutable receipt said the partner still needed to accept, despite acceptance already having occurred. The saved result now says “Request sent. Choose Done to see current handovers.” It remains accurate without pretending the original receipt describes current status. The corrected signed app preserves the existing journal across installation, displays the result at ordinary and largest text/dark, and Done explicitly clears it before showing the fresh current snapshot.
- Both fictional routines were archived through normal versioned commands. Stable test origins and ordinary Today are restored; scoped expense/grocery/handover journals are empty, Keychain/data and Money snapshots preserved, the owned relay stopped and its generated private key destroyed. The simulator-only certificate expires after two days; certificate removal and actual radio loss are not claimed.

## Verification and provenance

`integration-tests.txt`: all three real isolated PostgreSQL/PostgREST handover integration tests pass, zero failures/skips. They cover request/acceptance response loss, exact replay, alternating successor semantics, authorization/revocation and stale terminal conflicts. Initial launcher attempts lacked the required fixture environment or selected a directory without initdb; the configured existing fixture binaries then passed. These startup mistakes were not app failures.

Strict Swift formatting, source limits, actual signed debug builds and push-disabled signing verification pass on the Mac. Source before the copy fix is `b99795c9`; all1,031 repository native-input hashes match. `rendered/fixed-native-inputs.json` records the same input set with only the corrected `ChoreHandoversScreen.swift` hash changed. Its source label names the base plus patch rather than claiming an unpublished future commit ID. No new domain logic or mirrored copy test was added.

`rendered/recovered-request.png` and `recovered.json` retain the original false current-status wording. `corrected-normal.png`, `corrected-largest.png`, `corrected.json` and `finished.json` prove the correction and explicit result completion. Raw exported file hashes are retained in `rendered/artifact-hashes.json`; Oxfmt changes JSON formatting, so `artifact-hashes-current.json` gives the checked-in artifact hashes.

Observation recovery: the UI observer initially assumed a one-page list could scroll to bottom, then assumed a nil Codable receipt had a JSON key. Inspection showed the target already visible and the nil key omitted. The observer resumed the existing intent without repeating any positive action. Native UUIDs encode uppercase; independent receipt comparison normalizes typed UUIDs. These observer corrections did not alter application commands or server state.

## Still open

Both physical phones, VoiceOver/haptics, actual radio loss, full alternating/membership-change native journeys and complete M4 acceptance remain open. This correction is newer than TestFlight build15. Exact-source CI at `32897294` now passes Nest37169218381 and SwiftUI37169218366:484 Foundation/41 explicit skips and396 signed-native/11 explicit skips, zero failures, strict formatting/source limits and actual signing. See `ci-routine.json` and `ci-native.json`. No cloud build, release submission, production mutation or service purchase occurred.
