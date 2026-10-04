# Native variable bill confirmation — 4 October 2026

This is bounded M7 verification against the separate nest-test API on the owned
SE3 simulator. It does not close M7 or the goal. No production action, worker
activation, purchase, beta submission or merge occurs.

The bill form now keeps amount/share labels visible and adds native keyboard
Done/Review controls. Incomplete shares are refused without journaling and the
amount is preserved. Real normal and largest-text/dark Review corner taps use
44×44 controls. Largest-text Record is343×93.5. The first signed journey build
contains the keyboard change; the final build also restores description, payer
and note from the immutable recorded receipt when reopening, with a truthful
“Recorded bill” heading. No financial/domain/authorization rules are changed.

[Journey](journey-native-tests.json) and [final](final-native-tests.json) Mac runs
each pass the same two focused native recovery/preflight methods with0failures
and0skips, strict Swift format/source limits and actual signing. Controlled
transport tests cover lost reply and six preflight faults; they are not an actual
hosted lost-reply journey. Four source-input parts per build record all1,041
hashes. [Final installation](final-installed.json) matches the signed executable,
uses stable test origins and preserves data/Keychain and the original receipt.
Current commit CI is recorded in docs/progress.md when complete.

## Real confirmation and recovery

One ordinary API request creates the fictional variable-only rule named
`Fictional native variable bill 894747fa`, due4October2026. Its confirmed bill is
3centimes, paid by A with A3/B0 allocation. Native review retains the exact amount,
both shares, payer and date. One maximum-text native Save appends exactly one
expense. [Native command/receipt](native-result.json), [save intent](save-intent.json)
and [independent API proof](bill-api-proof.json) record the operation and event.

The same SQLite command/receipt survive an actual process restart and signed
client update. Reopening through the original rule shows its original description,
payer, note, due date and shares. [Actual recovery](recorded-reopened.png) and
[native recorded detail](native-recorded-detail.png) show these read-only paths.
One native Done clears only the terminal bill slot, revealing no bill due.
[Finished state](finished-state.json) and [final Today](restored.png) verify all64
scoped journals empty with app data/Keychain preserved.

A single explicit [known-operation HTTP replay](wire-replay.json) returns the
identical receipt; it is not another native Save or a lost-reply simulation. Both
members agree on59 paginated events and unchanged zero balances. Owner recovery
returns the receipt; partner recovery is unresolved/null, outsider403 and
anonymous401. Cycle coverage advances to the next due date.

## Retention and limits

[Before](before-history.csv)/[after](after-history.csv) preserve all58 original
summaries exactly. The same58-ID [read-only SQL](retention-query.sql) and matching
[digests](retention.json) verify all columns of original financial/allocation/
ledger rows and claimed Storage metadata unchanged; no new Storage byte read is
claimed. Only the named new variable rule is normally paused; all other rules and
all59 append-only financial events remain. [Cleanup](cleanup.json).

[Observer notes](observer-notes.json) disclose the rejected monthly fixture's
extra field, missing retained identity for that failed operation, the Swift
nil-versus-wire-null receipt comparison, an oversized scroll switching tabs before
Save and an initially incorrect read-only SQL column. None triggered another
successful native Save. Raw credentials, provider payloads and build logs are
excluded. Keyboard/review/save captures use the first source stage; reopened
receipt/detail/Done/restoration use the final source stage.

Final normal/light Today is restored. Largest-text recorded-recovery rendering,
hosted uncertain cancellation/lost reply, private approval variants, broader
membership/concurrency/radio-loss/VoiceOver, two native clients, live AI and both
phones remain unverified. The available TestFlight16 predates this view change.
