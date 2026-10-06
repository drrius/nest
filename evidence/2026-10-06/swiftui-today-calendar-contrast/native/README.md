# Today Calendar-card contrast viewport diagnosis

At **abc39697678bddd92a5c8ec1f16355826acab902**, the three exact Calendar-card targets were fully visible before one unfiltered contrast audit. The audit **failed with two unsuppressed reports**. Four dated 699 canonical GET observers passed; the diagnostic controller completed and restored original state. No repeat audit or shipping change occurred.

| Method                            | Result |                      Seconds |
| --------------------------------- | ------ | ---------------------------: |
| Alex baseline GET                 | PASS   |                       15.064 |
| Sam baseline GET                  | PASS   |                       12.613 |
| Calendar-card contrast diagnostic | FAIL   | 51.358 summary / 37.612 case |
| Alex final GET                    | PASS   |                       13.400 |
| Sam final GET                     | PASS   |                       11.543 |

## Measured placement and retained findings

The original method was preserved. The new method positions the whole Calendar access card, rather than only its heading and a preceding meal link. Placement succeeded after three bounded measured pans, before the single audit invocation.

Actual tab-bar frame: `[0,584,375,83]`. There was no navigation bar in this Today view. The guarded viewport was `[0,0,375,504]`, with an 80pt band above the tab bar excluded.

| Target                                                                     | Full frame `[x,y,width,height]` | Gap above tab bar |
| -------------------------------------------------------------------------- | ------------------------------- | ----------------: |
| On your calendar                                                           | `[38,241,136,20.5]`             |           322.5pt |
| Open Calendar to review access. Your personal details stay on this device. | `[38,275.5,293,42.5]`           |             266pt |
| Open Calendar                                                              | `[38,332,299,44]`               |             208pt |

All three were hittable and entirely inside the measured viewport. The Open Calendar action was also enabled and 44pt high; it was never tapped. Each pan uses measured `x16`, outside all current action regions and scrollbar `[342,20,30,564]`, inside the actual Today scroller `[0,0,375,667]`.

All actual reports are retained in `all-findings.json`, the native attachments, descriptions and crops:

| Audit-reported label              | Frame               | Position relative to tab bar |
| --------------------------------- | ------------------- | ---------------------------- |
| All proposals and saved decisions | `[38,533.5,299,44]` | Bottom 6.5pt above bar       |
| Manage renewals                   | `[20,595.5,335,44]` | Below bar top                |

The preaudit screenshot and both issue screenshots show the same placement. The proposals crop contains its text; the renewal crop covers the floating bar at the reported element region. These are exact viewport associations, not a palette measurement, platform-defect finding or exemption. The three guarded Calendar labels were not returned among this invocation's two reports; previous findings remain open. This scoped contrast audit cannot be compared as a whole-screen report count or used to close Dynamic Type/anonymous findings from earlier audits.

Root directly reviewed all eight images and independently checked the three target frames, all three pans and both report identities. Its separate pixel record measures the guarded explanation at **5.3028:1** and Open Calendar at **7.4927:1** on the actual white background, using exact source-matching solid sRGB glyph pixels. These ratios apply only to those named clear-card captures; neither remaining reported control was measured there. The unfiltered audit remains failed and all 19 original reports remain unclosed.

The existing `scripts/census-native-accessibility.py` produced `finding-census.json`; its proximity bands are diagnostic, not exemptions. The root's separate `prepared-diagnosis.json` preserves the prior census and failed premise without replacing old reports.

## Source and state boundaries

Fresh unique signed UI products attest **1126** input hashes at `abc396`, actual `NativeContrastViewportTests.swift`, `TodayScreen.swift` and `TodayCalendarSection.swift` compilation, selected product paths, three binary hashes, test origins, build19 and pushfalse. SDK products remain explicitly **6997138485f3f8088fc03682432de74879e19659 / 1122 inputs**; no newer-source SDK execution claim is made.

Both paired SDK reads compare complete terminal 62-event history, Alex+1/Sam−1centime balances, all 8 exact recurring rules, original 7 inactive rules, roster, immutable owner creation/reminder receipts, partner receipt isolation, shared settings and removed-renewal/reminder history. The native journey did not open Calendar, change permissions/settings, invoke a model, create a fixture or issue a domain mutation. SDK authentication setup may POST login/refresh; total wire POSTs were not measured.

Both original actors/household scopes and 64 empty journals were restored through ordinary foreground launch. Local ingredient/calendar semantics and measured initial large/light settings were unchanged. The in-test defer and final screenshots show Today/Me+shared. Selected private plans and scoped caffeinate were independently confirmed absent after controller terminal; restoration flags are not the sole cleanup evidence.

## Export and verification

All 8 exported PNGs were directly inspected. Sanitized attachments retain all findings, frame observations, actual pan geometry, preaudit/main/crop images, restoration and full source/product attestations. Raw xcresults, videos, binaries, credentials and private plans remain private.

The immutable verifier checks source maps against their exact archived commits, every artifact hash, all four canonical reads, both retained findings, full Calendar-card geometry, consumed invocation markers and restoration:

```sh
python3 evidence/2026-10-06/swiftui-today-calendar-contrast/native/verify_inventory.py
```

Before the coordinated artifact commit only, `--allow-untracked-precommit` omits the tracked-file gate. The default requires every artifact to be tracked. This is retained diagnostic evidence, not a passing accessibility audit or physical-device acceptance.
