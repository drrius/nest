# Paused recurring reminder refusal, 6 October 2026

The real signed simulator app passes complete normal/light and maximum/dark read-only refusal journeys for **Synthetic native manual-link QA**, paused rule `06146b4a-95e5-4227-a562-5aebacceea6d`, revision `cd7f8771-ad48-42cc-a4da-0ebfcbb215bf`, next due 11 October. The editor explains that only an active rule with a next due date can save choices. Reminder enabled, both recipients, 08:00 Europe/Zurich, zero days before and Save are disabled. Untouched 44pt Back closes without an alert. Reopening and ordinary Refresh retain those defaults, and Back returns to the unchanged rule.

Normal/light passes at the original `e3b5` source. Maximum/dark passes at the fixed `f709` source in 252.378 seconds, including separate whole-row readability of the title/status navigation target, mode/CHF0.03 amount and next due date. Normal was not repeated after the fix; its rendering retains the same order and fields. These local debug bundles report version 19. The published private beta19 does **not** contain this new layout fix.

Aggregate: **14 native passes, 2 retained failures**, comprising 12 authenticated SDK GET methods and 2 whole UI methods. The initial batch has 5 passes/1 failure; the observer-corrected MAX batch has 4 passes/1 failure; the fixed MAX batch has 5 passes/0 failures. Neither earlier MAX failure is relabeled as a pass.

## Retained MAX findings and fix

The initial method waits for the virtualized rule row before scrolling and fails at line54. The [75-second movie frame](initial/maximum_dark/failure-video-75s.png) shows the list introduction filling the opening viewport. The movie remains private; [provenance](failure-frame-provenance.json) records its hash, duration and extraction time.

The observer correction moves that existence wait after the existing measured reveal. It finds the target but preserves the full-frame guard and fails after 24 bounded observations. Its compound NavigationLink is 599pt tall while the viewport between the navigation bar and floating tab bar is 502pt tall, y74...576. Full placement is impossible. No tap on this target or reminder control occurred. See [measured geometry](maximum-geometry.json), [complete frame history](maximum-recovery/maximum_dark/18B6C726-1C05-451D-B85E-E7880AD5FC3A.json) and [actual failed capture](maximum-recovery/maximum_dark/8E419948-0E40-4D04-86C6-CD9051CBC7DE.png).

The parent-owned shipping fix uses separate title/status, mode/amount and due rows at accessibility sizes. Native fonts remain unrestricted and normal rendering retains its existing fields/order. The fresh fixed MAX method proves the [whole title/status target](fixed-maximum/maximum_dark/5B0AF630-E5C3-42F6-8DC9-EC8E4799CEFB.png), [mode/amount row](fixed-maximum/maximum_dark/F5D5DA6E-54AF-453B-8B1E-2BEA96E75FFE.png), [whole inactive explanation](fixed-maximum/maximum_dark/E1DCA344-252A-4D86-84BD-1A597299AB28.png) and [disabled Save](fixed-maximum/maximum_dark/C5E96E59-E1E7-46CD-B4CD-FC8FF07CFD04.png).

One post-refresh capture, `71B12015...png`, includes a visible horizontal transition offset/cropping. It is retained. The immediately following settled `378BFC45...png` and original `C5E96E59...png` show the complete disabled Save label. This is focused control/viewport acceptance, not full-screen layout or animation approval.

## Canonical preservation

All twelve fresh before/after SDK methods authenticate the original fictional actor, verify household membership, read the exact paused context, complete seven-rule list, two-member roster, balances and complete native financial history. Both actors and all three batches match the same whole canonical value. History has 62 entries over two pages of 50+12 with a terminal nil cursor. Alex retains +1 centime and Sam −1; the reminder remains nil. No rule activation, Save, expense, approval, financial link or hosted command occurs.

The earlier 61-event reference is preserved by a local semantic comparison of every API summary field. UUID casing and omitted optional nulls are the only normalizations. The sole additional event is the previously documented **Nest QA PDF posted 20261005**, `1ec7156d-277a-4501-8231-c1a12a52b8ef`, CHF0.02, created 5 October at 13:34:04.670541Z. Its equal split explains the retained balances. [Provenance](local-history-provenance.json) pins the original CSV and posted-PDF explanation to an immutable commit. This is API-summary preservation, not a raw ledger/database hash claim. No balance reset or corrective posting was performed.

The preceding HTTP401 and isolated current-session diagnostic remain separately preserved in [their checkpoint](../swiftui-native-natural-session-diagnostic/README.md). Successful current reads do not explain or claim to fix that earlier failure. The earlier eligible-fixture preflight found no active recurring rule or active renewal; active reminder draft coverage remains open.

## Executed source and cleanup

- Initial UI: `e3b5b5929f86118be8f7aac13bafd0dca6026d17`, all 1108 native inputs.
- Observer-corrected MAX UI: `dacea8fa1e83a7887ff1d4282a927cad4d551d85`, all 1108 inputs. Its only native difference is the UI wait order.
- Reused SDK binary for those two batches: `1e8a5869d818dd1824d6c7c8bc01a2b998a026b9`, all 1107 inputs. Each UI map equals this map except its single added UI test.
- Fixed MAX SDK and UI both rebuilt: `f7094205df23cb2d1908fd5e36e69326837e1cc6`, all 1108 inputs, including shipping layout commit `2465acb2`. Only the recurring-list shipping view and this UI observer differ from the preceding native map.

All builds passed. Strict Mac Swift formatting and the repository's all-Swift source limits passed. Each batch held the exclusive owned-simulator lock and scoped caffeinate. Final scopes and all 64 empty intent journals match both original actors. Selected private test plans were removed and caffeinate stopped. Both simulators returned to large/light; all six final screenshots show Today top with Me + shared. Original Keychains, roles and stores remain intact. Push is disabled and no worker activation was requested.

All 35 exported PNGs were individually inspected in the owned fictional scope. Accessibility trees, frame records, sanitized logs and result summaries remain attached. Private MP4s, native UI snapshot binaries and synthesized-event binaries are omitted from public manifests and explicitly inventoried. No tokens, passwords, private configuration or raw Auth logs are exported. Physical devices, active-rule draft behavior, delivery, calendar/APNs permissions and broad accessibility approval are outside this proof.

Run `python3 evidence/2026-10-06/swiftui-paused-recurring-reminder/verify_inventory.py` from the repository. It verifies every tracked artifact/hash, immutable per-source maps, retained outcome counts, complete canonical equality and the pinned local history comparison. Routine CI compiles these guarded tests; hosted methods require dated owned-simulator opt-ins.
