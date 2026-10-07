# Expense API outage and retained draft

Source `458e45eddcc5ae7f478a3891a6e640df60237b54` passes one signed native
SE3 simulator method in 66.714 seconds, with no failures or skips. The client uses
the real authenticated nest-test API for reads through an owned HTTPS relay.
After reviewing CHF 1.01, the relay returns 503 for the fresh balance read.
The app refuses to start the financial intent and displays the retained-draft
message before review details. Returning the relay online and choosing Reload
people and edit preserves the exact description and amount. Explicit Discard
returns to Today. Both captured screens were inspected.

The relay forwards no writes and observes no attempted financial POST. Its only
local control requests switch offline and online. All 64 scoped journals on the
clone remain empty. Eight hosted before/after fingerprints are exact, including
66 financial events, 108 allocations and 132 ledger rows. The positive write
budget is zero. This is a controlled API outage, not physical radio loss or a
lost acknowledgment after a committed write.

The terminal receipt confirms original simulator state restored, the temporary
clone deleted with its trust store, relay stopped and owned private key/control
configuration removed. No production action, model call or release occurs.
One grouped negative/nonfinite frame warning remains unresolved. The captured
simulator log contains five emissions from SwiftUICore, beginning when Add
expense opens before field focus. The complete captured log includes unsymbolicated
backtraces omitted from the grouped xcresult summary. Matching installed-framework
UUIDs and atos resolve the leading caller in all five to SwiftUI's
InputAccessoryBar.body.getter, which constructs the rejected fixed frame. This
narrows investigation to native keyboard-toolbar layout; it does not establish
an application or Apple defect. The frames are retained in
`symbolicated-frame-warnings.json` and `frame-warning-diagnosis.json`.
Full financial recovery, accessibility and both-phone acceptance remain open.

`prepared.json` records preparation before invocation. `summary.json` records
the completed native run; `request-proof.json` records relay outcomes;
`terminal.json` records cleanup. `before.json` and `after.json` retain exact
protected-data comparisons.
