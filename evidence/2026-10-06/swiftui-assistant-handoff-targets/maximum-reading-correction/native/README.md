# Accent capture and continuous reading correction

The signed native app at **0f203577** passed a bounded normal/light **capture-only** method. All six enabled/hittable handoff targets were 303×58 points and fully visible; no destination was opened in this normal method. Root's independent [rendered color analysis](../rendered-normal-label-contrast.json) binds the actual notification-target screenshot to 523 solid sRGB accent pixels `[51,93,73]` over background `[218,226,222]`, yielding **5.6782** contrast compared with the historical muted **4.0186**. This supports the measured normal foreground/target, not a full audit or other states.

The corrected maximum/dark navigation is retained as **FAIL**. It safely established unrequested Calendar permission without tapping it and opened Calendar, Busy sharing off, Ingredients and Notifications. All four links passed full-viewport/44-point guards at **303×119 points**. The 589.5-point ingredient paragraph was read through overlapping beginning/end coverage: 508 points per viewport, **426.5 points overlap**, stable height and separately captured viewport bounds. The prior whole-paragraph-fit failure is not relabelled.

The new failure occurs before Setup entry. Its 303×119-point link remained below the viewport. Twenty-four forward gestures at x371 overlapped the actual right scrollbar region `[342,74,30,510]`; target y positions oscillated instead of reaching visibility. Exact frames, tree, motion records and screenshot remain. This is a measured observer-geometry problem, not an action-target size failure. Setup/Profile maximum navigation and the whole maximum method remain unverified. No further correction execution is included here.

## Actual outcomes and source

| Method                       | Outcome | Summary seconds | Testcase seconds |
| ---------------------------- | ------- | --------------: | ---------------: |
| Alex dated-699 before read   | PASS    |          12.664 |       Native log |
| Sam dated-699 before read    | PASS    |          13.128 |       Native log |
| Normal capture only          | PASS    |          37.280 |       Native log |
| Corrected maximum navigation | FAIL    |         231.293 |          217.485 |
| Alex dated-699 final read    | PASS    |          10.903 |       Native log |
| Sam dated-699 final read     | PASS    |          12.058 |       Native log |

**5 native passes, 1 retained failure**. The old dff normal navigation/maximum failure remain separately immutable in the [first phase](../../native/README.md). No old normal navigation, capture or failed maximum invocation was repeated on unchanged source.

UI source is exactly **0f2035775172c41a8f094c121433ecfba43ebef7**, with a fresh unique signed build, all 1125 input hashes, actual owned-test and changed Assistant-file compilation, selected-product paths and binary hashes. SDK products remain explicitly the attested **6997138485f3f8088fc03682432de74879e19659** source with 1122 inputs. Their four reads preserve exact full62 terminal history, balances +1/−1 centime, roster/eight rules, removed renewal/reminder history, shared settings, owner immutable receipts and Sam unresolved/nil private receipts.

## Synthetic fixture and restoration

Root separately inserted and verified new private fixture **4c528a2f-42a3-4e3d-a909-5a0ff7f106da**, with six explicitly synthetic handoff outputs and zero model-turn/save children. Root strictly removed it once after terminal. Its [cleanup proof](../fixture-cleanup-verified.json) preserves the 15 original conversations, existing disabled Alex consent10/generation17 and empty busy-snapshot fingerprint; both old/new fixtures are absent. Root's privileged fixture setup/removal is separate from the native zero-domain-mutation budget. The controller contains no SQL/fixture mutation runner.

Busy sharing required root's verified existing disabled owner consent, both original-actor privacy journals absent and a live fully visible Allow-calendar-access state. Permission, Settings, toggle, Save, Reply, Ask Nest, publish, add, financial decision and model actions were never invoked. SDK auth setup may POST login/refresh; no all-wire POST count was measured.

Original ingredient receipt/revision9/sequence9/choices, Sam's absent review, calendar selections and privacy journals remain semantically exact. Original actor/household scopes, 64 empty journals per actor and measured initial large/light settings were restored through ordinary shipping foreground launch. Final images show Today/Me + shared. Private plans were removed and scoped caffeinate stopped.

All **20 exported PNGs** were directly reviewed by the execution worker and contain only the authorized fictional scope. Root independently reviewed the new normal color representatives and the failed maximum frame. Raw xcresults/videos/binaries/credentials/private plans are omitted and inventoried. This proves synthetic handoff rendering and partial result navigation, not live AI, maximum whole-method acceptance, a full accessibility audit or private beta/physical-device inclusion.

```sh
python3 evidence/2026-10-06/swiftui-assistant-handoff-targets/maximum-reading-correction/native/verify_inventory.py
```

The local read-only verifier pins immutable source/artifact inventories, exact semantic preservation, failed/passed outcome separation, target/paragraph geometry, supporting root color/cleanup records and direct PNG review. `--allow-untracked-precommit` leaves only the tracked-artifact gate pending the coordinated commit.
