# Two native clients: alternating chores and handovers

Status: **bounded native creation, handover, completion convergence and archive
verified** against the real isolated nest-test API. Full M4 acceptance remains open.

The owned SE3 simulators use separate normal fictional identities and Keychains.
No credentials, tokens, private configuration or personal row contents are exported.
Tests refuse physical phones and require explicit fixture opt-in.
Controlled API unavailability is not physical Airplane Mode.

## Native journey and evidence

One native Add creates a daily alternating chore. Both SDK sessions read the exact
routine, occurrence and original first assignee; both UIs display cadence and
rotation. Request-review Cancel leaves no transfer. Ten methods pass, zero failures
or skips. [Setup results](setup-native-results.json), [fixture](created-fixture.json),
[restoration](setup-restoration.json).

[Handover results](handover-native-results.json):30 methods pass, zero failures/skips.
The sender requests once; the real API commits while the relay drops its successful
reply. The scoped journal survives cold restart. The sender's actual HTTP acceptance
attempt receives403. The recipient reviews/cancels, then accepts once through their
own native UI. After acceptance, the sender explicitly retries the same operation
and exact wire body; the API returns the original receipt without undoing acceptance.
A reverse request is reviewed/cancelled, then declined by its recipient.
Accepted responsibility and original future rotation remain unchanged.

[Journal and wire receipts](handover-recovery.json) distinguish persisted journal
and HTTP body hashes. Ten paired SDK checkpoints agree:
[request states](handover-states-request.json), [decisions](handover-states-decisions.json).
All798 compiled inputs match source b4dd8494: [identity](handover-source-inputs.json).

[Completion results](completion-native-results.json) retain12 executions:
11 passes and one failed archived-list observer, zero skips. The original member
queues one completion while their API is unavailable; exact intent/captured chore
survive cold restart. The partner independently completes online once. Reconnection
replays the original operation/body and receives the partner's canonical
already-completed result. Both SDKs agree on the next day and assignee.
[Journal, attempts and teardown](completion-recovery.json),
[paired states](completion-native-states.json).

A read-only hosted audit before archive independently proves one canonical
completion, two operation receipts, one current and one preview, with the original
alternating anchor retained. [Roles and receipts](completion-before-archive.json).
Taking over today's chore does not shift future rotation.

One ordinary native Archive succeeds. The observer incorrectly expected an archived
routine in the active list; the API explicitly filters archived routines and their
work. The corrected test asserts absence. Four read-only native methods then pass:
both SDK readbacks and both ordinary Today selections. No positive command repeats.
[Readbacks](archive-readback-results.json), [source](archive-readback-source-inputs.json).
All798 compiled inputs match the final Linux source.

All19 original routines,24 occurrences,five completions,four transfers and112
original activity rows retain exact hashes. All62 financial events,104 allocations,
124 ledger entries and Storage fingerprints stay exact. Three owned activity events
are appended: routine created, occurrence completed, routine archived.
The owned routine/completion history remain; archive removes its preview and retains
its inactive current occurrence under existing semantics. Active native reads
expose none of its work. [Hosted retention](final-hosted-retention.json).

Both normal identities finish on Today/stable test origins with64 empty journals
each. Controllers and relays are terminal; the loopback listener, generated private
keys and temporary relay configurations are gone. Household work creates no money.

## Keyboard fix and retained failures

The shared create/edit title field has native Done and Return focus dismissal.
Actual create Done and edit Return/no-save pass; Return preserves the title and
leaves Save disabled. These shipping changes are newer than build17.

Two earlier creation tests failed before Add: event synthesis timed out while the
Mac became unavailable, then an observer repeatedly dragged inside an open keyboard.
Both failures remain on the Mac; zero-row/empty-journal inspection preceded each
fresh attempt. Only a hung diagnostics collector belonging to an already-failed
test was interrupted. No unrelated process or journal was cleared.

The archived-list observer failure remains in the completion results. Correcting
its contract assertion required only readback/navigation, without another mutation.

## CI and remaining acceptance

Source b4dd8494 passes Nest37348042463/SwiftUI37348042498:
496 Foundation cases/41 skips,425 signed-app cases/16 skips, zero failures,
strict format/limits, actual push-disabled signing and guarded UI compilation.
[Native CI](ci-native-keyboard.json), [routine CI](ci-routine-keyboard.json).
CI compiles manual tests but does not execute their hosted actions.
The archived-list assertion correction at f9ec8792 now also passes
Nest37350253862/SwiftUI37350254016 with the same case/skip counts and zero failures:
[native CI](ci-native-archive-readback.json), [routine CI](ci-routine-archive-readback.json).

Earlier prepared-source/CI artifacts remain historical checkpoints.
[Baseline](baseline.json) establishes original rows.
[Relay validation](harness-validation.json) is11 synthetic checks, not native proof.

Broader membership/revocation and schedule conflicts, physical radio loss, all text
sizes, VoiceOver/haptics, both phones and complete daily-use/design acceptance remain
open. No model call, beta, production operation, purchase or merge occurred.
