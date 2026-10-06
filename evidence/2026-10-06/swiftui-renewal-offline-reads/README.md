# Persisted native renewal reads, 6 October 2026

Renewal lists and visited details now persist validated snapshots for the current actor and household. An unavailable refresh can show previously loaded information with its capture date and an instruction to refresh online. Restarted stores preserve that information. Authorization and contract failures do not fall back to snapshots. Existing mutation, reminder and editor-choice preflights continue to use the network-only helpers.

The read-only list uses member names from the existing validated, current-lease chore snapshot. Missing names retain the existing honest unknown-member label. It does not require a new roster network request or a separate roster cache.

List captures have a collection identity. A fresh first page invalidates older subsequent pages; late page responses cannot repopulate the previous collection. Obsolete read responses use the newer validated snapshot with stale guidance, or fail if there is no coherent snapshot. They do not return the old network value as fresh.

Recording an authoritative renewal receipt now atomically invalidates that account's cached list pages and persists the exact detail. A confirmed removal cannot reappear as an active cached list after a failed reload. The list remains unavailable rather than pretending to be known empty. Other detail snapshots are preserved. Replaying an identical recorded receipt cannot overwrite a newer detail or invalidate newer list reads. Membership revocation purges the renewal read cache within the existing scoped cache transaction.

| Verification                                  | Actual result                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Behavioral reproduction before implementation | Two focused AppTests failed on lost rows/loaded state after offline restart and unavailable refresh |
| Focused Foundation tests                      | 23 passed, zero failures                                                                            |
| Signed fake-transport AppTests                | 12 passed, zero failures                                                                            |
| Real native API/SQLite integration            | Alex and Sam each passed one guarded test                                                           |
| Online SwiftUI smoke                          | Alex and Sam each passed the existing read-only empty-list test                                     |

The 35 local fixture cases cover persistence, actor/household isolation, obsolete leases, malformed/foreign cached bodies, pagination collections, cache replacement, membership denial, late account switch, existing lost-receipt recovery, cancellation, online-only mutation preflight, confirmed-removal readback failure and identical receipt replay. Delayed responses are captured before their test pause, proving that an old active detail cannot revive a confirmed removal and an older first page cannot replace a newer capture.

The real integration read only the existing owned removed renewal `17919246-d8ec-4402-b301-da1149d1cc35` and the empty active list through the normal authenticated Nest test API. Both members still read the retained removal revision `2bd612c0-3ce2-408c-8735-7b32e3ea6357`, title `Nest native renewal edited 20261006`, date 2026-10-06, zero notice and null assignment/recurring link. It did not create, edit, remove, revive or configure a reminder on that record.

After real native authentication and API membership verification, the integration test bound the existing test-visible Session ready state and SQLite lease to that verified member. It used the shipping view loaders to persist the real server response. It reopened the ephemeral SQLite file, simulated unavailability only in renewal transport, and obtained identical removed detail plus an empty cached list with dated guidance. No renewal response was fabricated. See [Alex](integration/alex/native-read.json) and [Sam](integration/sam/native-read.json).

This establishes a signed native API/store integration with controlled transport failure. It does not establish a full authentication/onboarding restart, actual airplane mode, physical radio loss or offline UI on a phone. The separate SwiftUI smoke exercised online profile identity, real empty-list loading, saved snapshot creation and return to Today. There is no new shipping fault mechanism, native permission change or hosted mutation.

Strict Mac Swift formatting, the repository source limits and Git whitespace checks passed. Every newly touched function was also checked against the 80-code-line and complexity-10 budgets, including test functions. The 80-line ChoreOfflineStore initializer stayed unchanged; the new read table is created by the existing read-table factory. Dependency versions and shipping server/domain contracts are unchanged; RenewalList gained only Codable support for its validated snapshot.

[Integration results](integration/results.json), [UI results](online-ui/results.json), [Foundation log](foundation-tests.txt), [focused signed tests](focused-app/summary.json) and [reproduction](reproduction/summary.json) preserve the observed outcomes. The integration and UI source inventories identify the inputs of the binaries used. Full private build logs remain on the authorized Mac, including an initial test-fixture compile correction and an implementation compile correction before the passing runs. Exported native log text was checked for JWT/Bearer credentials and removes trailing whitespace only. No protected configuration or credential file was exported.

All six original exported PNGs were inspected. They show the fictional Today screen, the actual empty renewal lists and the final restored Today screens. Both owned simulators are left with their original actors/household, large/light settings and 64 empty intent journals. `renewal_read_snapshots` is a read cache and is excluded from intent counts. See [restoration](restoration.json). The integration's ephemeral stores were removed by normal test teardown.

`sha256.json` inventories the exported evidence. Native source hashes are recorded under `integration/source-input-hashes.json` and `online-ui/source-input-hashes.json`. Historical controllers in `controllers` are an audit trail, not a request to replay hosted actions. No SQL census, server mutation, model call, purchase, release or main merge was performed. The full native release goal remains incomplete.

Native source `4ca7089e2ca17519866986338bd0308afa1b5d91` now passes
[SwiftUI CI37414362787](https://github.com/drrius/nest/actions/runs/37414362787).
It executes 502 Foundation cases with41 explicit skips and454 signed-app cases
with22 explicit skips, zero failures, plus four Swift Testing cases. Formatting,
source limits, actual signing and guarded UI compilation pass. The hosted opt-in
journeys remain skipped in CI; their explicit local executions are recorded above.
Routine CI37414362829 is superseded and cancelled by the documentation checkpoint;
[Nest37414479462](https://github.com/drrius/nest/actions/runs/37414479462) passes
at62ec2723 with identical shipping native code. [CI metadata](ci.json) and
[actual totals](ci-totals.txt) preserve this distinction. The inventory verifier
uses the immutable4ca7089e source by default; `--working-tree` is an optional
comparison, not a reason to rerun a previously verified hosted journey.
