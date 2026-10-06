# Bottom scroll-edge comparison

The iOS 26 hard bottom-edge candidate did not improve this measured Today audit. One unfiltered `RootAccessibilityTests/testTodayAccessibility` on retained source `69971384` failed in 23.761 seconds by result summary (9.614 seconds in the XCTest method log). One on fresh candidate `e528ab32` failed in 21.396 seconds (9.641 seconds in the method log). Both reported exactly the same two bound contrast findings, with no anonymous or noncontrast finding in these invocations:

| Label            | Frame x/y/width/height | Tab-bar frame      |
| ---------------- | ---------------------- | ------------------ |
| Open meal plan   | 38 / 559 / 299 / 44    | 0 / 584 / 375 / 83 |
| On your calendar | 38 / 663 / 136 / 20.5  | 0 / 584 / 375 / 83 |

Every finding, full screenshot and automatic element crop is retained, including the black calendar crops for the below-viewport element. Finding order differs; exact labels, descriptions and geometry agree. The conditional four-header method was not run because contrast did not improve. Root reverted the five shipping experiment edits separately. This is a failed candidate comparison, not audit acceptance, palette attribution, an Apple defect or closure of prior anonymous/other audit reports.

The five affected root files at 699 byte-match the candidate's parent. The baseline uses independently revalidated retained 699 UI products and all 1,122 native inputs. Candidate e528 uses a fresh unique UI build with 1,123 pinned native inputs, owned compile lines, selected products and binary hashes. Strict signing, build19 and fixed fictional test origins were checked. No baseline rebuild or incremental candidate product was substituted. `root-source-comparison.json` records all five file hashes; immutable Git verification remains valid after the separate revert.

Both runs used the original Alex simulator at measured large text/light appearance and the same initial Today placement. Initial full screenshots show matching header/content anchors; `viewport-comparison.json` includes a rendered pixel sample excluding the changing status-bar clock. The existing audit method does not attach root-header AX frames, so no new header-frame acceptance is claimed. Actual issue and tab-bar frames are attached by the unfiltered diagnostics, whose callback returns false for every finding.

Four dated GET-only SDK reader methods passed before/after: Alex 15.576/13.128 seconds and Sam 11.420/11.637 seconds. The reused SDK source is 699, not the candidate/current mirror. Each checked original rule creation operation `5bdfcaeb-3f20-4fa3-9db9-0f0902eede8f`, reminder operation `f23e5dfb-cc10-4199-a0f1-bc2cfcbd521c`, owner immutable receipts, Sam private-receipt refusal, shared reminder `f736854d-935a-4433-ba0c-13a4b5e51ac6`, all eight rule DTOs, full terminal 62-event history/balances and known removed-renewal histories against the mandatory baseline. All were unchanged. No Save, Done, financial command, SQL, permission or provider diagnostic was invoked.

The controller completed comparison/restoration despite the two audit failures. Both original actor/household scopes and 64 empty journals matched before/after, measured initial large/light settings were restored, owned selected plans removed and scoped caffeinate stopped. Ordinary final foreground launches returned both to Today/Me + shared. These terminal captures are restoration evidence, not extra acceptance methods.

All 12 PNGs were directly reviewed in their rendered contact sheet and show only the authorized fictional scope. Root directly reviewed the two initial full-screen images and two meal-plan crops. Raw xcresults, movies, credential configuration and selected plans remain private on the authorized Mac; exported binary omissions are inventoried. The public controller is provenance for the completed comparison, not permission to rerun audits.

Run the read-only immutable verifier:

```sh
python3 evidence/2026-10-06/bottom-scroll-edge-comparison/verify_inventory.py
```

It verifies tracked hashes, both immutable source maps, retained/fresh build attestations, all findings and conditional-run logic, four canonical reads and final restoration. It performs no native or API action.
