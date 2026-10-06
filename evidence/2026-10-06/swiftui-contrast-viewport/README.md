# Today contrast findings in a measured viewport

One normal/light Test Alex Today diagnosis ran on the owned SE3 simulator. Both
original named targets were positioned fully above the native tab bar before one
unfiltered contrast-only audit. The method fails with two retained reports,
exit 65. Nothing is filtered, accepted or closed. [Actual result](results.json),
[all new findings](issues.json), [measured comparison](outcome.json).

| Element                     | Frame y/height | Separation above bar y584 | Contrast finding in this run |
| --------------------------- | -------------- | ------------------------- | ---------------------------- |
| Open meal plan              | 389.5 /44      | 150.5pt                   | None                         |
| On your calendar            | 493.5 /20.5    | 70pt                      | None                         |
| Calendar access explanation | 528 /42.5      | 13.5pt                    | Failed                       |
| Open Calendar               | 584.5 /44      | Overlaps                  | Failed                       |

The original two labels do not recur in this viewport. Two different findings
appear nearer or behind the bar. This supports investigating viewport-associated
reports; it does not establish an Apple defect or accessibility acceptance.
The [original 19 reports](../swiftui-current-accessibility/README.md), including
anonymous findings, remain open. No shipping colors, layout or audit filters changed.

The existing `AccessibilityAuditDiagnostics` attaches each issue and returns false
for every finding. Screenshot, accessibility tree and per-scroll frames show
placement before the audit. All seven exported PNGs, including the two native
failure crops, were inspected. Both full failure screenshots and issue descriptions
are preserved. [Public attachment inventory](manifest.json) lists only exported
artifacts; [private attachment inventory](private-attachments.json) explicitly
records the MP4, binary UI snapshots and synthesized-event records retained in the
original private xcresult. No finding was dropped.

The full 1090 prepared source inputs include the new diagnostic test. The separate
[shipping inventory](shipping-source-inputs.json) excludes all test-only additions
and matches recorded source b3e76f6a exactly. Strict native formatting, source limits,
complete JSON/Markdown formatting and tracked artifact hashes pass. The guarded
method skips in ordinary CI. The diagnostic does not rerun the unchanged full audit.

No hosted command, Save, permission, relay, data reset or production action occurs.
The test's defer restores Today top and the selected Me + shared filter after the
failed audit. The controller restores the ordinary large/light view and original
actor/household with 64 empty intent journals, excluding the renewal read cache.
[Restoration](restoration.json) and the final screenshot record that state. Private
selected plans are removed and scoped caffeinate ends. Original credentials and
Keychains are untouched.

The committed diagnostic checkpoint13b00520 passes [Nest37416103059](https://github.com/drrius/nest/actions/runs/37416103059) and [SwiftUI37416103073](https://github.com/drrius/nest/actions/runs/37416103073). Native CI records502 Foundation cases/41 skips and454 signed-app cases/22 skips, zero failures, four Swift Testing cases and strict formatting/limits/signing/UI compilation. It compiles the optional diagnostic rather than executing or approving the failing manual audit. [Metadata](ci.json) and [totals](ci-totals.txt) retain this distinction.
