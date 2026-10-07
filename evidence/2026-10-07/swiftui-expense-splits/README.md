# Native expense split choices and unsent reviews

Shipping changes use native navigation pickers for Paid by and Split. The original
Split trigger measured 34.5 points. Review identifiers label the rendered amount,
payer and member share value leaves; visual labels and financial rules are unchanged.

Normal Alex picker execution passes at 67c4395e. Normal Sam picker execution passes
at 8133669e. Both normal Alex review methods pass at 8133669e, and both normal Sam
review methods pass at 4a3d6d1e. Shipping inputs are unchanged across these sources;
the later changes correct test input replacement, value-leaf observation and returning
from an already-selected native payer choice. Original failed executions are retained.

The exact review rejects shares totaling 100 centimes for a 101-centime expense,
then renders CHF 1.01 with Alex CHF 0.25 and Sam CHF 0.76. The percentage review
assigns 25 percent to the displayed person and verifies literal shares after integer
rounding. Both actors use Test Sam as payer. Native Select All replaces existing input
instead of relying on caret position. Back offers explicit discard; no financial Save
is selected. Request traffic is not measured, so these are UI assertions, not proof
that no HTTP POST was emitted.

Current source 4a3d6d1e freezes 1,141 inputs and validates signing, test-only public
origins, build 19 metadata and actual compiled products. Completed normal Sam execution
restores both original member scopes, 64 empty journals, original display settings and
local privacy/calendar/first-use semantics. Largest-text/dark checks for both members
remain pending. Independent post-run financial fingerprints and final evidence sealing
remain pending. Routine CI 37562483137 passes this source; native CI 37562483127 is running.

This is simulator verification. It does not establish financial posting, receipt-bearing
split variants, full accessibility or either phone's acceptance. No new TestFlight
submission, production operation, inference or merge occurs.

The original largest-text Alex batch at 4a3d6d1e finishes with zero passes, three
failures and zero skips. All fail at bounded reveal after split selection, before
payer selection. The target is unrealized; the retained tree is at the bottom
Review expense row. The two test callers now search earlier for Paid by in
3f82451e. Shipping code, expected literal shares and target limits are unchanged.
Original scopes, 64 journals, display settings and local semantics restore.
Corrected largest-text execution remains pending.

At 3f82451e the largest-text picker passes in 194.179 seconds; both review
methods reach payer and share fields but fail waiting for Select All. Captured
native trees show a paginated edit menu with Select and Forward, while the field
is keyboard-focused. The correction in f7d1990c taps the fully visible native
Forward control before Select All. This changes only the test interaction, with
unchanged financial math, literal expectations and shipping inputs. All scopes,
64 journals, original settings and local semantics restore. Corrected reviews
and Sam's largest-text checks remain pending. Both source-specific 3f82451e CI
workflows pass; the stored excerpt distinguishes 506 Foundation/41 skips and
473 signed-app/41 skips from the guarded UI compilation.

At f7d1990c both largest-text Alex reviews successfully use Forward/Select All
and replace the inputs with exactly 0.76 or 25. Both subsequently fail reading
the amount because the form retains a bottom scroll offset and the absent target
was sought downward. Both full native diagnostic trees and screenshots are retained.
Original scopes, 64 journals, display settings and local semantics restore.
Source 00d65b11 makes only the first amount read search earlier. Its 1,141-input
signed preparation passes, and both Alex reviews are running. Sam's maximal
checks remain pending. Both f7d1990c CI workflows pass; routine CI also passes
00d65b11, whose native CI remains running.

At 00d65b11 both Alex maximal review methods pass with zero failures/skips:
exact 448.491 seconds and percentage 429.517 seconds. Both original member
scopes, 64 journals, display settings and local semantics restore. The actual
amount and partner-share screenshots are directly inspected; literal CHF 1.01
and CHF 0.76/0.25 are visible at largest text. Other text can be above/below the
viewport, so this is not full continuous review-copy or VoiceOver acceptance.
Sam's maximal picker and both reviews are now running. Both 00d65b11 CI workflows
pass, separately recorded from native UI execution.
