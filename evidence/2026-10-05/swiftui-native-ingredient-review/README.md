# Native saved-selection and ingredient confirmation

Eight actual Mac simulator checks pass with zero failures/skips: both normal SDK
accounts read the owned19 October week before selection, after local Save choices
and after one actual native grocery confirmation. The original member saves rice,
returns to Today, reopens the same week and sees that selection retained. Lentils
remain unchecked. The native dialog confirms exactly one ingredient; both members
read the same new100g rice item and meal link. Week revision stays9; six one-off
meals correctly supply no ingredient list. [Executions](results.json),
[canonical result](canonical-addition.json), [restoration](restoration.json).

No grocery is added by saving choices: the complete29-row/five-link baseline is
unchanged afterward. Confirmation adds one item/one link. All29 original grocery
rows and five original links remain exact, including archived history; all14
original meal/finance/history row sets also match. [Before](before-groceries.json),
[after Save](after-save-groceries.json), [after confirmation](after-confirm-groceries.json),
[retained groceries](retained-groceries.json), [other retained history](retained-meals-finance-history.json).
The resulting owned item is `d24cc35d-a6ae-44c6-9780-e28f8723d44d`. Do not repeat
the confirmation or whole fixture creation. No journal/history reset is used.

Three earlier observer failures are preserved. iOS prefixes the quantity/unit
labels; an accessibility-row center tap misses the visible trailing switch;
the Form exposes no ScrollView element. Exact observed labels, a visible-switch
tap and ordinary native screen swipes fix the observers. Each failure occurs
before Save/Add. The final helper opens Meals directly after normal Profile
identity verification. No shipping app source changes for these corrections.
[Label failure](observer-1-selector-failure.txt), [tap failure](observer-2-tap-failure.txt),
[scroll failure](observer-3-scroll-failure.txt).

All811 inputs match both after execution and the local source; strict focused
Mac Swift formatting/source limits pass. [Inventory](source-inputs.json).
Both fictional memberships, stable test origins, large/light and64 empty command
journals per client remain. The original member's return to Today is actually
asserted; the partner has SDK reads only in this pass. [Receipt image](receipt.png)
and [confirmation](confirmation.png) show the successful native result. The saved
notice is below the tab-bar overlay in [its capture](saved-choice.png); its existence
passes, but complete notice readability is not established. A native invalid-frame
runtime warning is retained, undiagnosed and unsuppressed. Full accessibility,
both-phone/grocery-screen reading, prep/editing and live AI acceptance remain open.
The earlier e3d644e5 passes Nest37371365801/SwiftUI37371365809:496 Foundation/41
skips,440 signed-app/18 skips, zero failures, strict format/limits/signing and
guarded UI compilation. [Receipts](initial-source-ci.json), [totals](initial-source-ci-excerpt.txt).
It is separate from the final test-helper corrections; latest source CI is pending. No model call, beta upload, purchase, production or merge.
