# Native refund, correction and keyboard recovery — 4 October 2026

An actual refund form had no keyboard Done/Review controls and lost its description
label after typing. Both Money forms now use the existing persistent-label native
field and44-point keyboard toolbar. Replacement shares have distinct labels without
a duplicate heading. Financial commands and authorization are unchanged.

## Source and execution

The owned SE3 simulator `C3ABC0D4-CFD4-4F23-8CC3-0E542014803A` runs iOS26.3,
actual signed SwiftUI app `ch.drrius.nest`, and stable isolated nest-test origins.
Fictional Test Alex/Test Sam share household `be772ffd-3ab5-41d5-8438-647a79a553da`;
outsider and anonymous reads are checked separately. No actual money moves.

The full1041-input [journey](journey-source.json) and [final](final-source.json)
manifests each have three CSV parts. Both differ from parent `c45b265b` in exactly
RefundScreen/CorrectionScreen. Journeys use the earlier keyboard build; the final
build removes only duplicate correction-share headings. The final layout receives
its own unsaved native inspection, without repeating any financial save.
[Final labels](final-correction-labels.png) and
[final restored Today](final-ordinary-today.png) are paired with actual node/state
records and a matching [installed executable](final-installed.json).
[Journey](journey-native-tests.json) and [final](final-native-tests.json) signed Mac
runs each pass six focused native refund/correction recovery, online source
preflight and account-boundary tests with0failures/0skips. Strict Swift formatting,
source limits, signature and stable origins pass. Controlled test transports are
not hosted provider proof. Prior parent CI does not verify these view changes;
new commit CI is recorded in docs/progress.md after it completes.

## Actual refund

Source `5366793d-cdb8-4e5a-8e8a-7c5ee5946466` remains a3-centime expense with
A2/B1 allocation. Native review records exactly one1-centime received refund with
A1/B0 allocation and explicit fictional note. Normal and maximum-text/dark keyboard
Review corners are44×44; maximum-text Record is343×155.5.

Operation `9643d7a1-b396-4acd-8f20-e14ce7659257` creates event
`d95f3ef7-b4ef-479e-82c5-d3e0c67eb7bc`. Its exact SQLite command/receipt survive an
actual process restart, reopening from the original entry and native result-detail
navigation. Remaining refund allocation becomes A1/B1. A linked active refund
correctly blocks correction of that original. Native Done clears only the terminal
refund slot. [Independent API proof](refund-api.json).

## Actual replacement

Source `76e8efd4-d6d8-490c-a703-58790523609d` remains its3-centime original expense.
The native Replace entry draft displays5centimes with A4/B1 allocation, the same
payer/date and explicit fictional note. Keyboard Review passes at normal/maximum
text. One maximum-text confirmation records operation
`492a79b6-f187-4519-8f2f-308ab62b5dc3`, appending reversal
`ba90bf91-42f0-42d2-861a-c98a178d7781` and replacement
`70f6a136-97d3-488c-bdd6-85e20115ac84`, linked to the original.

The reversal has A−1/B+1 signed effects; replacement A+1/B−1. Both members agree on
their details. The original refuses another reversal/replacement. Actual restart,
original-entry receipt reopen, native replacement detail/shares and normal Done
preserve the same command/result and clear the terminal slot.
[Independent API proof](correction-api.json).

## Retention, privacy and boundaries

Both complete paginated histories grow55→56→58; both balances stay0. All55 original
event summaries remain exact. Both private receipt APIs return the exact receipt
only to A; B receives unresolved/null, outsider403 and anonymous401.
[Before](before-history.csv)/[after](final-history.csv) and balances record the
complete reads. [Same55-ID read-only query](retention-query.sql) and
[matching digests](retention.json) prove original financial/allocation/ledger and
claimed Storage rows unchanged. Storage metadata hashes are not a new byte read.

Screenshots and node CSVs show actual controls; state JSONs show scoped journals.
[Observer notes](observer-notes.json) explain partial input, the completed text
command's watchdog, inherited identifier omission and a premature read-only count
assertion. None triggered another successful Save. Raw build/config/Auth/provider
logs and credentials are excluded.

Normal/light Today, stable final signed origins, preserved app data/Keychain and
all64 scoped journals empty are restored. No fixture reset/deletion, production
change, purchase, worker activation, beta submission or merge occurs. Hosted
lost-reply/cancellation/private approval variants, more correction/refund races,
VoiceOver/haptics/radio loss, two native clients, live AI and both phones remain
open. This advances M7 without satisfying its full acceptance criteria.
