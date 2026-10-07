# Native correction and refund posting

An actual signed SwiftUI journey uses the hosted nest-test API and the isolated
Test Alex/Test Sam household. It records one fictional CHF 0.02 expense, replaces
it with the same amount/shares and a corrected note, then records a full refund of
the replacement. Nest does not transfer money. Exactly three financial commands
produce four retained events: expense, reversal, replacement and refund.

The initial attempt recorded the expense, then its detail-reading observer failed.
The clone and canonical expense receipt were retained. Every later run resumes
that same recorded expense; no second expense is posted. The final resumed native
journey passes without failures or skips, posts the remaining correction/refund,
opens their recorded details and clears all terminal local commands.

The resumed check exposed a 34.5-point correction picker target. The shipping
Picker now has a 44-point frame/content shape. The executed final target measures
311 by 44 points and opens the native choice menu. [Geometry](final/picker-geometry.json),
[picker](final/picker.png), [correction](final/correction.png), [refund](final/refund.png).
All three images are inspected. Test observers now search toward earlier detail
rows and scroll to virtualized inputs/actions before requiring them; multiline
native fields are recognized. Assertions and posting confirmations remain intact.
The initial reading, target and preflight failures remain recorded. The first
preflight counted a read-cache table as a command journal and stopped before
execution; its corrected classification preserves the 64 actual command journals.

## Data and scope verification

- All 67 prior financial events, 110 allocations and 134 ledger rows retain their
  exact SHA-256 row hashes. No old row is removed or changed.
- The final counts are 71 events, 116 allocations and 142 ledger rows. All four
  new events have two ledger rows whose deltas sum to zero.
- The reversal and replacement link to the original expense; the refund links to
  the replacement. The original note stays absent and only the replacement has
  the corrected note.
- Both members' balances return exactly to their starting zero-centime values.
  The fictional history remains; it is not deleted as cleanup.
- The owned clone is deleted after its commands are cleared. Original actor/
  household scope and all 64 empty command journals match. Original credentials
  stay on the Mac; no server secret is copied into a client.

[Initial result](initial/summary.json), [target failure](target-failure/summary.json),
[final result](final/summary.json), [executed source hashes](final/source-hashes.json),
[retained receipt](final/saved-expense.json), [cleanup](final/cleanup.json),
[reconciliation](reconciliation.json), [new event relationships](events.json).
The final run retains an `Invalid frame dimension (negative or non-finite)` runtime
warning. It is not suppressed or attributed to the SDK without further evidence.
The earlier [standalone keyboard-toolbar diagnosis](../swiftui-keyboard-toolbar-probe/README.md)
already reproduces this message with matching framework stacks on iOS 26.3.1.
The current warning occurs when Replace entry introduces native inputs/toolbars;
its source location and current backtrace are unavailable. This is consistent
with the existing diagnosis, but does not prove identical origin. No new probe
or financial journey is needed to repeat that established result.
[Current warning context](frame-warning-context.json). This functional pass does
not close the broader runtime/accessibility or physical-phone gate.

A separate Test Sam clone now opens all four exact event IDs through Financial
history and reads their types/amounts plus the replacement note. This read-only
native case passes without failures, skips or runtime warnings. Its original
scope and 64 empty command journals match; the clone is deleted. A fresh
financial snapshot matches the complete post-journey snapshot, so peer reading
changes no financial row or balance. [Partner result](partner/summary.json),
[reconciliation](partner/reconciliation.json), [cleanup](partner/cleanup.json).

This proves both native clients' direct posting/readback and hosted balance/history
behavior for this fixture. Physical phones, other correction/refund variants, live
AI approvals, accessibility and production remain open. The final
passing invocation uses the explicit saved-expense resume branch; the corrected
beginning branch is not repeated because the one-use three-command budget is spent.
Build 22 is unchanged. The picker fix needs a later consolidated candidate.
