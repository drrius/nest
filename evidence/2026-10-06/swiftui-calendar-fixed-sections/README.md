# Calendar fixed-section comparison

One unfiltered Calendar audit on retained UI source `310524b1` failed with six findings; one on candidate `42bd044b` failed with four. Font reports fell from four to two, but the other-finding identity gate was not satisfied. Both had two contrast reports, with a previously anonymous report becoming a named availability paragraph. Root reviewed the evidence and reverted the outer-stack experiment. This records a partial count change and unmatched identity, not unchanged results, an Apple defect, audit approval or closure of an anonymous finding.

The baseline audit took 24.173 seconds by result summary (10.293 seconds in the XCTest method log). Candidate took 21.979 seconds (10.341 seconds in the method log). All categories, descriptions, bound/unbound labels, exact frames, automatic screenshots and available element crops are preserved. Both invoked `RootAccessibilityTests/testCalendarAccessibility` exactly once; diagnostics returned false for every issue. No controls-only, reading, follow-up or unchanged audit was run.

| Report                                                                      | Baseline  | Candidate     | Exact frame                                               |
| --------------------------------------------------------------------------- | --------- | ------------- | --------------------------------------------------------- |
| Font: Allow calendar access                                                 | Present   | Present       | 40 / 461.5 / 295 / 44                                     |
| Font: iOS calls this Full Access. Nest uses it only to read your calendars. | Present   | Present       | 40 / 407.5 / 295 / 38                                     |
| Font: Your partner’s availability                                           | Present   | Did not recur | Baseline 20 / 550 / 182 / 18                              |
| Anonymous font                                                              | Present   | Did not recur | Baseline 0 / 0 / 0 / 0                                    |
| Contrast: Your partner’s availability                                       | Present   | Present       | 20 / 550 / 182 / 18                                       |
| Anonymous contrast / named unknown-availability paragraph                   | Anonymous | Newly bound   | Baseline 0 / 0 / 0 / 0; candidate 40 / 600 / 287.5 / 64.5 |

The newly bound paragraph reads “Availability is unknown. Your partner may not be sharing, or their snapshot may be stale or outside this day.” Its candidate crop overlaps the floating tab bar. The old anonymous contrast has a full-app screenshot but no element crop or usable AX frame, so it cannot be declared the same report or closed. All reported tab-bar frames are 0 / 584 / 375 / 83. Initial full screenshots show matching header and content anchors; `assessment.json` retains a pixel comparison excluding the changing status-bar clock. A different viewport was not counted as improvement.

The candidate changed only the outer fixed-section Calendar `LazyVStack` to `VStack`. Inner `QuietSectionCard` data-list lazy layout, fonts, colors, padding, accessibility and audit filtering were unchanged. Baseline Calendar source byte-matches the candidate’s parent. Both UI source maps contain 1,123 inputs; candidate was compiled in a fresh unique signed UI directory, while the retained 310 UI products were independently revalidated by selected paths, binary hashes, signing, build19 and fixed test origins. Immutable source verification remains valid after root’s separate revert.

Four mandatory GET-only methods passed using explicitly retained SDK source `69971384` / 1,122 inputs: Alex before 13.962 and final 10.936 seconds, Sam before 12.092 and final 11.122 seconds. They preserved owner immutable operations `5bdfcaeb-3f20-4fa3-9db9-0f0902eede8f` and `f23e5dfb-cc10-4199-a0f1-bc2cfcbd521c`, Sam private-receipt refusal, shared reminder `f736854d-935a-4433-ba0c-13a4b5e51ac6`, all eight exact rule DTOs, full terminal 62-event history/balances, roster and known removed-renewal histories against the required baseline. No replacement baseline or hosted mutation occurred.

Both original scopes and all 64 empty journals matched before/after. Measured initial large/light settings were restored, owned selected plans removed and scoped caffeinate stopped. Ordinary final foreground captures show Today/Me + shared. No calendar permission, selection, Save, Done, financial command, SQL or provider diagnostic was invoked.

All 22 PNGs were directly reviewed in two rendered contact sheets, with both initial full-size captures inspected separately. Root directly reviewed four representative full screenshots: baseline/candidate initial viewports, the old anonymous-contrast full screenshot and the newly bound contrast full screenshot. All show only the authorized fictional scope. Raw xcresults, binary/video attachments, credential configuration and private plans remain private on the authorized Mac; omitted binary attachments are inventoried.

Run the read-only immutable verifier:

```sh
python3 evidence/2026-10-06/swiftui-calendar-fixed-sections/verify_inventory.py
```

It checks tracked artifact hashes, all three source maps, retained/fresh product attestations, every audit identity/count, four exact canonical reads, visual-review coverage and restoration. It performs no native or API action.
