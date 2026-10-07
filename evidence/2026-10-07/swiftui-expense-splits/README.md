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
