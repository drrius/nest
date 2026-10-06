# Native reminder adjustment target proof

The new native Increase/Decrease buttons passed actual centerX, centerY±21pt taps in the real Chore reminder editor. The normal/light and maximum/dark journeys changed unsent days-before 0→1→2→1→0, then explicitly used Back/Discard and reopened the canonical disabled reminder at zero with disabled recipient and adjustment controls. Decrement was also observed disabled at zero while Reminder enabled was on. There were no Save taps or hosted commands.

The final source adds a fixed 18pt symbol font inside the same measured 44×44pt targets. One additional maximum/dark journey passed the same four taps and ordinary Discard/reopen cleanup with visibly compact symbols. Label Dynamic Type was preserved. Normal text was not rerun after this icon-only change. Its earlier passing proof and source-identical button geometry remain recorded; the verifier checks that the only native input change between those versions is that one symbol-font line.

## Actual runs and immutable inputs

| Folder               | Source commit                              | Actual native outcome                                                                         |
| -------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `before`             | `beaf65e848e88125a83059ebdf633b1ff2ee5f72` | Two Alex SDK GET passes; normal UIKit Stepper first-edge FAIL; maximum not run.               |
| `control-size-large` | `3696248cd341beed0d29425bd51e83c939769d1c` | Two Alex SDK GET passes; sizing modifier did not change the first-edge FAIL; maximum not run. |
| `native-buttons`     | `d088e76a278f7fe0b242e6f131a00a3f5cf30830` | Normal and maximum complete UI methods plus before/after SDK GETs all PASS.                   |
| `icon-polish`        | `74d37d1a9ecd350f65a8ef9d56ae5402ef92498e` | Final-source maximum complete UI method plus before/after SDK GETs all PASS.                  |

The aggregate is 11 native passes and two retained failures: eight SDK passes, three UI passes and two UI failures. There were twelve successful edge taps across the passing UI methods. All 51 exported PNGs were visually reviewed and show only authorized fictional data. Both SDK and UI were rebuilt for each recorded source version, with 1099 original inputs and 1100 after adding the new native control. Current CI and physical-device acceptance are separate gates.

The original native Increment frame was `[296,503,47,32]`. The complete 44pt probe area `[297.5,497,44,44]` fit inside the actual Form row `[16,493,343,52]` and viewport y74–576. The real point `(319.5,498)` was five points above the action's 32pt frame; the value remained zero after a five-second wait. The sizing modifier repeated that exact miss. These are performed edge failures, not conclusions from accessibility frames alone. Each method stopped immediately; no center rescue, bottom-edge tap, Decrement tap or maximum case followed either failure.

For the new control, complete button frames measured 44×44pt, with all probe areas inside both the actual row and viewport before tapping. Geometry, tap coordinates, screenshots, trees and actual changed values are retained for every edge. Only the real Chore reminder editor was exercised; other reminder editors sharing this control are source-consistent, not claimed as native-tested here.

## Fixture and cleanup boundaries

The exact original **Hosted smoke tidy kitchen** occurrence `ce88cf42-4359-41d4-ab06-a7185c22306b`, due 2026-09-28, was accessed through Manage chores → Scheduled chores → the exact occurrence → Reminder choices. Its Today completion button was never tapped. All eight real authenticated Alex GETs returned the same nil reminder and item revision `3dbe564332651b162e8208fd9192c8482459e293feeae4e07e2cb9722bd4c061`, with the exact original chore and roster. No recipient selection was needed to enable the local adjustment controls.

Ordinary Back/Discard was observed in every passing UI method. It was not observed in the two failed methods: `continueAfterFailure=false` aborted before Swift defer cleanup, and the subsequent SDK host restart reset the unsent view. Those failures do not establish draft preservation across restart. Every run's final screenshots show Today at large/light, and both original actor/household scopes and all 64 intent journals remained unchanged and empty.

Only the owned Alex/Sam simulators, original sessions, stable fictional test origins and push disabled were used. No completion, reschedule, skip, server mutation, worker activation, permission, production or physical-device action occurred. Scoped caffeinate ended and selected private plans were removed. Original stores, Keychains, signing and authentication configuration were preserved. MP4/binary attachments remain private and are explicitly listed in `private-attachments.json`; credentials, test plans and build logs are not exported.

Run `python3 evidence/2026-10-06/swiftui-reminder-stepper-targets/verify_inventory.py` to check tracked artifact hashes, exported attachment references, all four immutable native input maps, recorded outcomes, tap observations, canonical equality and restoration. Its passing result proves evidence integrity and preserves both UI failures.
