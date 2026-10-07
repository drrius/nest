# Native payment and adjustment Back protection

Payment, refund and correction forms now share the native Keep editing / explicit
Discard interaction for unsent fields and reviewed intent. Busy work disables leaving;
already-saved financial commands retain their existing recovery. No financial history
or command receipt is removed by Back.

Correction compares the editable draft with the actual loaded entry, including its
automatically selected reversal/replacement mode. Refund recognizes its default
“Refund” description and initial payer/date; an untouched form does not prompt.
Payment recognizes its initial full-balance mode/date. Raw invalid and blank changes
still count as edits. Money history adds a semantic test identifier for existing
entries without exposing UUIDs in product labels or changing navigation behavior.

Source `e5bea30bfb636ea57776135ea445b4572c2f5a72` builds/signs all1,139 frozen native
inputs, with exact expected source delta and public test origins/push disabled/build19.
Both members' three normal-text methods pass: unsent payment/refund notes survive
Keep editing, explicit Discard leaves, reopening untouched forms closes directly,
and correction's pristine/reviewed states use the appropriate Back behavior.
Native history opens the existing fictional posted-PDF expense; no source is seeded
or changed. Test balance remains a one-cent receivable/debt. No Record payment,
Record refund or Confirm correction action is selected.

Each completed controller restores both original scopes,64 empty journals,display
settings and local privacy/calendar/ingredient/first-use semantics. Six actual normal
methods and decoded raw-log hashes are verified. Six normal/maximal confirmation screenshots
are directly reviewed. All12 methods pass, covering both members at normal/light and maximum/dark, with
zero failures/skips. All completed controllers restore normally. Whole tapped Back
and alert controls meet44pt minimum and complete visibility checks. Independent
read-only metadata verifies eight exact protected fingerprints, including complete
financial/ledger state, plus unchanged +1/−1 centime balances. This supplements,
not replaces, native authorization proof. [State](protected-state.json),
[executions](executions.json). Wire POSTs are not measured; record/confirm selections
are zero. Six normal/maximal confirmation screenshots are directly reviewed.
Native checks are distinct
from Foundation tests, compilation and routine CI. Routine37557131439 passes at
this source; native37557131449 also passes at the same source. Native CI executes506 Foundation
tests/41 skips,473 signed-app tests/41 skips and four Swift Testing cases with
zero failures. Its public raw log and decoded hash are retained.

This does not prove all field/date/split/receipt variants, replacement editing,
VoiceOver, physical phones or full M7 acceptance. Saved-command decisions still need
their existing explicit authorization. No financial save, provider request, production
operation, release, merge or automation occurs. These fixes are later than available
TestFlight build19.
