# Live system typography diagnosis

The audit claims the named Calendar accessibility nodes cannot change font size.
This check tests that premise by changing the actual simulator text category
while the same Nest process remains running. It does not modify shipping UI.

Five actual native methods pass with zero failures or skips: both-member SDK
reads before and after, plus the live Calendar test. Nest PID4151 remains the
same across the three live samples. After restoring ordinary text, the test
also relaunches at maximum size for a cold reference.

| Calendar element             | Normal | Live maximum | Restored normal | Cold maximum |
| ---------------------------- | -----: | -----------: | --------------: | -----------: |
| Permission explanation       |     38 |        348.5 |              38 |        348.5 |
| Allow calendar access        |     44 |        187.5 |              44 |        187.5 |
| Partner availability heading |     18 |        116.5 |              18 |        116.5 |

Heights are points. The test asserts growth, restoration and equality with the
cold reference within0.5pt. [Measurements](measurements.json),
[process and system changes](live-control.json), [method results](results.json).
All three screenshots were inspected. The maximum capture includes a partially
scrolled access button and long availability paragraph; it demonstrates font
growth, not complete paragraph reading or accessibility acceptance.

The three named controls do respond to system text changes. This contradicts
the warning's literal fixed-size claim for those controls. It does not identify
the anonymous font node, prove an Apple defect or close any audit finding.
All19 unsuppressed reports remain [open](../swiftui-current-accessibility/README.md).

All819 compiled inputs match local source, including the new guarded UI test.
Shipping source remains99ca6898. Both fictional roles,64 empty journals per
client, ordinary Today selection, large text and light appearance are restored.
The controller reused two completion-related metadata keys; [scope](scope.json)
records that this execution is read-only and sends no completion/date command.
Fresh hosted reads match the prior owned preparation, original retained hashes
and whole groceries/links exactly. No permission, inference, beta submission,
worker, production operation, purchase or merge occurs.

CI for the new guarded test is recorded separately after the source push.
