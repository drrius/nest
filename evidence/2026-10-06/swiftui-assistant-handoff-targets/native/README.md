# First synthetic device-handoff navigation phase

The actual signed native app at **dff8d993** passed the owned Alex normal/light navigation method, opening all six honest device destinations and returning by ordinary Back to Today/Me + shared. Each enabled/hittable handoff target was **303×58 points** and fully inside the content viewport. This is explicitly synthetic device-handoff rendering/navigation, not live model execution or a completed model turn.

The maximum/dark method is retained as **FAIL**. Its first three action targets measured **303×119 points** and passed their full-viewport/44-point guards. Calendar opened. Busy sharing was measured but safely omitted because the live unrequested-permission state was not established before checking the virtualized permission button. Ingredients opened and its week identity passed, then a noninteractive paragraph failed the observer's whole-frame requirement: height **589.5 points** exceeded the **510-point** viewport. The paragraph can scroll; this is an observer requirement error, not an action-target sizing defect. Maximum notifications, setup and Profile were not attempted. No corrected execution is included here.

## Actual methods

| Method                                  | Result | Summary seconds | Testcase seconds |
| --------------------------------------- | ------ | --------------: | ---------------: |
| Alex dated-699 canonical baseline       | PASS   |          12.958 |   See native log |
| Sam dated-699 canonical baseline        | PASS   |          12.370 |   See native log |
| Normal/light six-destination navigation | PASS   |          82.145 |           80.354 |
| Maximum/dark navigation                 | FAIL   |         111.922 |           97.856 |
| Alex dated-699 canonical final          | PASS   |          13.949 |   See native log |
| Sam dated-699 canonical final           | PASS   |          13.207 |   See native log |

Aggregate: **5 native passes, 1 retained native failure**, with four SDK passes and one UI pass/one UI failure. No invocation was retried. Preparation and baseline-only stages are distinct from UI execution.

The six exact links are Open Calendar, Review busy sharing, Review ingredients, Review notifications, Review your setup and Open Profile. Destination evidence binds native Calendar header/body, Busy sharing off, ingredient week 2026-10-19, Notifications, Your setup and the original Test Alex Profile. There was no permission, setting, checkbox, Save, publish, add, Reply, Ask Nest, approval, Record or Done action.

## Fixture ownership and preservation

Root separately created exactly one synthetic private conversation `4e809372-f12d-4004-afd3-9a502e98de23` in the fictional test household, containing six honest handoff outputs and no model-turn/save children. It was independently verified before native execution and strictly removed once afterward. Root's [cleanup verification](../fixture-cleanup-verified.json) preserves all 15 original conversations, the existing disabled Alex calendar-consent row and empty busy-snapshot fingerprint. Root's privileged fixture setup/removal is separate from the native **zero domain-mutation budget**. The native controller contains no fixture/SQL mutation runner.

Busy-sharing opening is guarded by root's independently verified existing disabled Alex consent, live unrequested Calendar permission state and exact absence of both `calendar_privacy_removals` and `calendar_consent_changes` for the original actor/household. This avoids implicit initialization or permission-loss cleanup. Sam never enters that screen. A failed or unknown guard produces a separate measured-but-not-opened record.

All four dated SDK reads preserved the exact terminal 62-event history, balances +1/−1 centime, roster, eight rules, removed renewal/reminder history, shared reminder settings and original immutable owner receipts. Sam's private receipt queries remained unresolved/nil. Auth setup may POST login/refresh; no all-wire POST count was measured and no model or native domain command was invoked.

The original Alex ingredient review already held an acknowledged receipt for the previously added rice. Its receipt, revision9, sequence9 and choices remained exactly unchanged; Sam's review stayed absent. Device-only calendar selections and both privacy journals also remained semantically unchanged. These snapshots acknowledge permitted view normalization rather than silently repairing local state. Original roles/household, 64 empty journals per actor, measured large/light settings and foreground Today were restored. Private selected plans were removed and scoped caffeinate stopped.

## Immutable source and artifacts

Fresh UI products are **dff8d993c224936b869ae16c937989ea3d8677a5**, with 1125 input hashes, signing/origin checks, selected product paths and binary hashes. Actual compilation of the owned test and all five changed Assistant row/history files is retained. Reused SDK products remain explicitly **6997138485f3f8088fc03682432de74879e19659**, with their original 1122 inputs and attestation; they are not relabelled as dff products.

Two exact executed controller variants are preserved. The preparation/baseline controller accidentally used the setting-loop key as its trace filename, so its valid scope samples remain under `content_size`. The separately hashed UI execution controller fixes that diagnostic shadow and adds the root existing-disabled-consent gate. The baseline is not relabelled as having executed the corrected controller.

All **22 public PNGs** were directly inspected by the execution worker and contain only the authorized fictional scope. Attachments, measured scroll observations, the omitted branch and failed paragraph are preserved. Raw xcresults, videos, binaries, credentials and private plans remain outside this package; omitted attachments are inventoried. The old muted foreground shots are historical and are not evidence for any later accent-color correction. This does not close contrast audits, maximum whole-method acceptance, live AI or physical-phone/private-beta inclusion.

```sh
python3 evidence/2026-10-06/swiftui-assistant-handoff-targets/native/verify_inventory.py
```

Before the coordinated commit, `--allow-untracked-precommit` verifies all content/source/semantic gates while explicitly leaving the tracked-artifact gate pending. The default requires every artifact to be tracked and performs only local read-only verification.
