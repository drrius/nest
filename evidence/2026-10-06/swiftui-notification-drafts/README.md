# Notification draft navigation

Notification preferences previously cleared their model on every disappearance,
including a child-screen push. Returning also reloaded saved values. Back and
Reload could discard an unsent draft without asking.

The focused model regression fails before the fix with edited07:30/reminders-on
replaced by saved08:00/reminders-off. The corrected native before-fix connection
round trip independently fails with edited toggle1 replaced by saved0.
[Native failure](before-navigation/navigation-before-failure.txt).
The first native attempt fails earlier because its switch tap has not changed
the value; that observer failure is retained separately in before-observer.

Shipping fixf83ac658 retains unsent edits on return, requires explicit Back or
Reload discard, and clears values on account-generation changes. Confirmed
request completion explicitly reloads the fresh profile; uncertain requests keep
their existing recovery controls and operation identity. No preference is saved
merely by visiting the screen or changing a toggle.

Two controlled native model methods pass, including lost-response recovery;
one account method covers logout and member-switch races. Two existing fresh-read
methods also pass. The first after-controller incorrectly expects two account
methods instead of one; its terminal failure is an observer-count error, not a
native test failure. [Results](after-count-observer/results.json).

Normal/light native connection and Back/Reload/Keep editing/Discard/reopen checks
pass. Their four modal screenshots were inspected; headings and both choices are
fully visible and each target is at least44pt. Maximum/dark stops in Profile
before reaching the preferences screen because the generic meal-reader gesture
does not reveal the native List row. Its failure and live screenshot remain in
[after-list-observer](after-list-observer/results.json). That run does not verify
maximum-text notification behavior.

Observer62dd893f drags inside the List and retains the same full-visibility and
touch assertions. Its normal checks pass. At maximum size it now reaches Notifications, then
fails to reveal the reminder switch. The controller is terminal with failure;
this is not a maximum-text pass. Next inspect actual switch types/labels/frames
before changing the reader again. [Result](after-switch-observer/results.json). Current
source routine CI37393161511 passes; native CI37393161341 is in progress. The
earlier f873210c source independently passes both required workflows.

Before runs preserve original roles,64 empty journals and large/light settings.
Interrupted after-runs restore those settings, but do not assert both Today
selections or complete after-read comparison. All820 current inputs match the final interrupted run. Preference and receipt
hashes remain exact. Final canonical after-reads, maximum-text checks and physical
phone acceptance remain pending.

## Control and motion diagnosis

The five-stage census preserves expected labels and switch type40. At maximum
size the reminder row is217.5pt tall; a visible row can extend beneath the bar.
Named and predicate lookups both work. A direct120pt drag moves the row110pt,
making its inner switch hittable. All five original images were inspected.
[Census](control-census/stage-2.json), [motion](motion-probe/stage-3.json).
Each diagnostic controller finishes with four canonical SDK reads agreeing and
restored roles/64 empty journals/large/light. These diagnostics do not verify
discard or draft preservation.

The measured and native-swipe attempts both pass normal interaction checks but
fail after the connection-screen round trip. The activity log confirms the
connection was opened before the failure. Returning retains the lower scroll
position; the reader searched downward for an earlier, virtualized row.
The new reader searches upward on return and after Reload, while retaining
full visibility and44pt choices. The directed interaction run now passes all
eight methods: four real both-member SDK reads and four native normal/light and
maximum/dark interaction checks. [Results](directed-success/results.json).
Earlier measured failure and locator/motion observations are preserved separately.
The shipping model/screens remainf83ac658; only guarded UI diagnostics change.

Source62dd893f now passes Nest37393161511 and SwiftUI37393161341:496 Foundation
tests/41 skips,443 signed-app tests/20 skips, zero failures, strict format/limits,
signing and guarded UI compilation. Docs sourceef75d2ac passes Nest37394005548.
Exact observer98629e89 passes Nest37396636862 and SwiftUI37396637155.

## Completed bounded native check

Connection navigation preserves the unsent toggle on both tested configurations.
Back and Reload require explicit discard; Keep editing retains the value, Reload
restores saved choices and Back discard/reopen leaves the server value unchanged.
All eight modal images were inspected. Complete headings and both choices remain
inside the native alert bounds, with targets at least44pt at maximum size too.
The app returns to Today after each interaction. Both original fictional roles,
64 empty journals per client and large/light settings are restored. All820 inputs
match source98629e89. Canonical recipe/week/preparation SDK before/after reads
agree. Fresh notification, owned preparation, original retained and whole grocery
hashes match the prior checkpoints exactly.

This verifies local unsent draft behavior against actual test-provider reads;
it does not send a preference Save, prove APNs delivery, close the19-report root
audit or replace VoiceOver/physical-phone acceptance. Build18 remains the latest
available private candidate and does not contain the later notification fix.
No hosted Save, permission, inference, worker, beta, production action, purchase
or merge occurs. Available TestFlight build18 does not contain this later fix.
