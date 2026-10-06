# Meals contrast at a measured viewport

One read-only normal/light Alex method performed one unfiltered native contrast audit. **The method remains FAIL** (35.465 s summary/21.284 s test case, four issue failures); the controller completed collection and restoration successfully. No palette/layout change, suppression, exemption, repeated audit, SDK method, fixture or hosted command occurred.

The exact current-week heading **Tuesday · 6 Oct** was fully visible/hittable at `(20,470,143,24)`,90pt above the floating tab bar starting at584. Its earlier contrast finding was at `(20,552,143,24)`, only8pt above that bar. It did not recur at the new viewport.

All four current findings are retained:

| Label    | Frame            | Relation to tab bar |
| -------- | ---------------- | ------------------- |
| Lunch    | 36,585.5,42.5,18 | Under bar blur      |
| Add meal | 138,585.5,87,18  | Under bar blur      |
| Dinner   | 36,646,45,18     | Below bar top       |
| Add meal | 138,646,87,18    | Below bar top       |

The original two anonymous Meals reports remain unmatched/open. The new audit produced no anonymous finding, which cannot establish identity or close those reports. Measured frames and rendered crops demonstrate viewport association. No Apple defect, full audit approval, physical-device result or closure of the19 root reports is claimed.

Immutable source `971553a68d31d7228e17a5598d8ac6cdf35fcfc5` has1116 native inputs. A unique owned fresh UI build recorded its actual owned-source compilation, selected product paths, app/debug-dylib/test-bundle hashes, strict signing and stable test origins/pushfalse. The tested resolver handles both native product placeholders; prepared source hashes alone are not treated as compilation evidence.

Both original actor/household scopes and64 empty journals were preserved. The test's defer returned Alex to Today/top/Me+shared; both apps were then foregrounded in large/light. Owned private plans and scoped caffeinate were cleaned. Signing/authentication credentials and Keychains were unchanged.

All12 exported screenshots/crops were individually inspected in a numbered contact sheet for fictional scope and visible state. Root separately reviewed the main capture and all four native failure crops. Exact reports, frames, AX tree, native log, summaries and private attachment omissions remain retained. Raw xcresults, binaries, build logs and private configuration/plans remain private.

Main screenshot: [Tuesday clear of tab bar](audit/meals-contrast/C676FD63-FC1A-4368-B9EA-B5C78A16FBD9.png).

Verify the committed immutable source and tracked artifacts without running UI/API actions:

```sh
python3 evidence/2026-10-06/swiftui-meals-contrast-viewport/verify_inventory.py
```
