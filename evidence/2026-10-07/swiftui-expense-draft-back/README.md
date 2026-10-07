# Native expense draft Back protection

Back now offers Keep editing and explicit Discard for unsent expense fields and a
reviewed expense that has not been saved. Blank or invalid raw input, split/payer/
category/note/receipt-total changes and a changed date count as edits. A pristine
form closes normally. Saved financial requests keep their existing recovery flow;
Back does not cancel or delete a financial command. Attached receipt storage stays
separate and the dialog explains its retention when one is attached.

Shipping source `57404b377412ceb996a39ec5e3d9ee81fa3e0fd2` has two passing normal-text
native methods for each member. They verify keyboard input, Keep editing, explicit
Discard, blank reopening, direct pristine Back and return to Today. Review uses a
fictional CHF0.03 draft and never selects Save expense. The largest-text Alex
unsent-form method passes; its initial reviewed method fails before financial
review when the observer cannot find a safe pan margin beside the keyboard.

The test then uses the visible keyboard Review action, asserts that the incomplete
draft cannot reach financial review, and scrolls only after the keyboard closes.
The next largest-text attempt reaches valid review, Back and Keep editing, then
fails while rereading the description above the current viewport. Its unrealized
row is absent from the hierarchy; the generic missing-target search moves forward.
The failure and all 24 bounded pans are retained. The corrected reader adds an
explicit backward-search option for this reread. No shipping behavior changes
between these observer corrections; whole-target44pt and safe-gesture constraints
are retained. `observer-census.py` reproduces the original actor/method outcomes.

The original source compiles/signs all1,137 frozen inputs. Routine
[37554215370](https://github.com/drrius/nest/actions/runs/37554215370) and native
[37554215393](https://github.com/drrius/nest/actions/runs/37554215393) pass. Native CI
executes506 Foundation tests/41 skips,473 signed-app tests/41 skips and four Swift
Testing cases with zero failures. Guarded hosted UI methods are separate from CI.
The two observer builds change only their recorded test inputs. Their shipping
inputs match the original fix. Safe exported results, screenshots, terminal
restoration, raw-log hashes and exact controllers retain each source separately.

`live-maximum-review-actions.png` is a read-only live capture during the second
attempt. It shows the review action section, but does not prove target geometry
or method success. Two normal confirmation images were directly reviewed.
The corrected largest-text Alex review passes in242.018 seconds and Sam review in
244.195 seconds. Sam maximal unsent and both current normal review methods also pass.
Across all attempts,12 methods retain10 passes/two observer failures/zero skips.
[Totals](execution-totals.json) distinguishes retained original and corrected results.
All completed controllers restore both original scopes,64 empty journals,display
settings and local privacy/calendar/ingredient/first-use semantics. Independent
read-only metadata confirms all eight protected fingerprints, including complete
finance, are exact. No financial Save is selected; wire POST traffic is not measured.
[Protected state](protected-state.json) supplements, not replaces, native authorization.

`live-backward-review.png` is a read-only capture during the confirmed running
backward-search method, showing movement toward the preserved description. Both
live diagnostic captures and four actual normal/maximal confirmation images are
directly reviewed. These images do not replace the native measured-target assertions.
Corrected-source routine37555574332 and native37555574402 both pass at `bca5f94e`.
The original/corrected source inventories and binary hashes remain distinct.

This is bounded simulator evidence. It does not prove physical-phone/VoiceOver,
all split/date/receipt variants, stored receipt Back behavior or full M7 acceptance.
No expense save, payment, provider call, calendar grant, production action, release,
merge or automation occurs. The fix is later than available TestFlight build19.
