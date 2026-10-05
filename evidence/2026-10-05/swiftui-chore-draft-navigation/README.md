# New-chore draft navigation

Status: bounded unsent-draft navigation and final native-alert rendering verified.
Full M1 accessibility and phone acceptance remain open.

## Reproduced loss and fix

The shipping form previously let Back discard edited title/schedule inputs immediately.
The actual before-fix test edits the form and navigates Back; Keep editing never appears.
[Before-fix failure](before-fix.json) preserves that outcome and empty-journal inspection.
No chore is submitted or created.

The form captures its initial draft once before loading. Unchanged forms retain normal
native Back navigation. Edited unsent drafts expose a Back control with a native
confirmation offering Discard draft and Keep editing. Keep editing retains the
exact title and repeat choice; only explicit Discard closes the unsent form.
Saved or uncertain durable requests remain under their existing recovery/cancellation
flow. This guard does not delete pending commands or send changes.

The control's label owns its minimum44pt frame and content shape, using a plain
native button. Merely framing a standard toolbar button rendered a36pt accessible
control: [retained failure](toolbar-frame-failure.json).

Two intermediate tests could not find Keep editing:
[root presenter](root-cancel-role-failure.json), [anchored presenter](cancel-role-failure.json).
The [captured popover](cancel-role-popover.png) proves the confirmation itself is
visible while the cancel-role action is omitted. An intermediate explicit ordinary action appears in the [normal popover](normal-popover.png).
All six [functional checks](popover-functional-results.json) pass, but the
[maximum-text image](maximum-popover-clipping.png) visibly clips the heading/message
and initially hides Keep editing. Functional passes do not establish acceptable reading.
A first native alert also passes [six functional cases](long-alert-functional-results.json),
but its [maximum-text image](maximum-long-alert-clipping.png) still clips the longer
explanation and Keep editing label. The final alert uses the short Discard draft?
question and two explicit choices, without the redundant explanatory paragraph.
No text-size cap, audit/report suppression or custom dialog is introduced.

## Bounded verification

The six earlier alert methods cover untouched Back, title/schedule preservation
through Keep editing followed by Discard, and schedule-only changes with a blank
title at normal/light and partner maximum-text/dark. After the final copy-only
change, both edited-draft journeys pass again. Native assertions require the
alert, heading and both action vertical bounds within the viewport, with both choices
hittable and at least44pt high. Rendered screenshots are inspected separately.
All checks use normal fictional SDK sessions against the actual nest-test API,
with fixture opt-in and physical-phone refusal. Add chore opens the form; its
submit action is never pressed. No save or positive command is sent.

[Intermediate popover identity](popover-source-inputs.json) matched799 compiled inputs to Linux.
[Long-alert identity](long-alert-source-inputs.json) is also retained separately.
[Final short-alert identity](source-inputs.json) matches all799 compiled inputs to Linux.
[Final native results](native-results.json) have two passes, zero failures/skips.
The untouched/schedule-only methods pass in the preceding six-case alert run;
they are not counted as newly executed against the final copy-only change.
[Normal](normal-confirmation.png) and [maximum/dark](maximum-confirmation.png)
images show the complete question and both choices after that change.
[Restoration](restoration.json) returns both normal identities to Today/stable
test origins, large/light and64 empty journals each. All ten hosted full-row
aggregate fingerprints remain exact: [retention](hosted-retention.json).
Strict Swift formatting and source limits pass. Current changes are newer than
TestFlight build17; their own current-head CI is still pending.

The full20-report accessibility audit, VoiceOver, all other text sizes/forms,
Reduce Motion/haptics and both-phone design acceptance remain open.
No model call, beta submission, production operation, purchase or merge occurred.
