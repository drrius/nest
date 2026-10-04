# Native PDF receipt selection, retention and removal

On 4 October 2026, the actual signed SwiftUI app selected one synthetic PDF through
Apple's document picker, uploaded its exact660 bytes to isolated nest-test Storage,
retained the same bytes/reservation after process restart, and removed the unposted
receipt with one maximum-text native corner tap. No expense or approval was created.

## Source and environment

Shipping native source remains `177d0a70`, already passing
[Nest37205046774](https://github.com/drrius/nest/actions/runs/37205046774) and
[SwiftUI37205046782](https://github.com/drrius/nest/actions/runs/37205046782):491
Foundation cases/41 explicit skips and409 signed-native cases/11 explicit skips,
zero failures, strict formatting/source limits and actual signing. This pass adds
actual rendered/hosted evidence, not a new compile or unit-test run.

The owned SE3 simulator is `C3ABC0D4-CFD4-4F23-8CC3-0E542014803A`, iOS26.3, and
the verified fictional account belongs to household
`be772ffd-3ab5-41d5-8438-647a79a553da`. All1,041 current Linux and isolated Mac native
inputs match the [current manifest](native-inputs-1.csv) ([part2](native-inputs-2.csv), [part3](native-inputs-3.csv)).
Strict installed signature verification, stable nest-test API/Supabase origins and
the retained signed executable hash pass again. [Provenance](provenance.json).
The temporary observer/verifier input hashes are in
[verification-inputs.json](verification-inputs.json); they are not shipping clients
or CI-native proof.

## Actual journey

1. Money → Add expense → Choose PDF opens the native document picker.
   [Picker](picker-open.png), [app target](open-attempt.json).
   One actual Cancel returns to the same form without a notice, upload or expense
   intent. [Cancelled picker](after-cancel.png), [state](after-cancel.json).
   The system-owned Cancel accessibility rectangle is36.5×36pt; this pass does not
   claim a44pt system control or full VoiceOver acceptance.
2. The simulator-only local Files provider was verified empty. Only the known
   [synthetic PDF](synthetic-receipt.pdf) was added. `pdfinfo` validates one unencrypted
   PDF1.4 page,420×180pt, no JavaScript/metadata/forms. [Fixture hash](fixture.json).
   [Actual selectable file](fixture-visible.png),
   [once-recorded selection](file-selection-intent.json).
3. One native selection stages and uploads the exact file. Its SHA256 is
   `33ed3cabbae34f22cac1b5938f386e112ee8560652d8945eed64703b74f032f4`.
   Only the receipt journal is populated; the expense journal remains empty.
   [Native receipt](native-result.json), [rendered attachment](pdf-attached.png).
4. Independent real Auth/API/Storage checks return the exact bytes to the uploader,
   deny the partner/outsider/anonymous while unposted, retain both complete52-event
   financial histories/balances, and retain the existing claimed receipt's exact
   bytes for both members. [Uploaded authorization proof](hosted-uploaded.json).
5. Actual terminate/launch and expense reopening retain the exact receipt/data.
   [Restart](restart.json), [reopened form](pdf-after-restart.png).
   This establishes durable retention, not network-request tracing or lost-reply
   recovery. No second picker selection is made.
6. At maximum Dynamic Type/dark appearance, receipt status and Remove are readable.
   The343×155.5pt Remove control receives one actual corner tap at356,221.
   [Large receipt](largest-attached.png), [target](remove-intent.json).
   Normal cleanup clears the original receipt slot and all64 scoped mutation/
   decision/receipt journals. [Removed state](receipt-removed.json).
7. Fresh authenticated Storage reads establish the new object is absent. Household
   metadata reads return410 Gone; outsider/anonymous remain403/401. Both histories,
   balances and pending inventories match the preselection baseline, and the old
   claimed receipt remains readable with exact bytes by both members.
   [Hosted cleanup](hosted-cleaned.json).
8. Only the hash-verified local synthetic PDF is removed; the provider root is empty
   again. Normal text/light appearance and ordinary Today are restored with original
   app data/Keychain and all64 scoped journals empty. [Fixture cleanup](fixture-cleaned.json),
   [restoration](restored.json), [actual Today](restored.png).

Actual labelled accessibility controls from each stage are retained in
[controls.csv](controls.csv). No credential, signed URL, private conversation or
calendar text is exported.

## Observer corrections and limits

Money retained its earlier recurring subpage. The initial root-navigation observer
was stopped after inspecting that live process/screen, then corrected with explicit
native Back controls. It did not open a picker or submit a financial command.
A generated observer syntax error stopped before fixture preparation; syntax was
checked before the corrected transfer. The maximum-text form exceeded the initial
scroll budget; inspecting actual state and scrolling to the bottom exposed Remove
without another upload. Expired independent verifier sessions stopped during
read-only preflight and were renewed without touching native Keychain sessions.

The cleanup observer initially expected403 for removed metadata; actual source
`nest_read_receipt` and API error mapping establish410 Gone for household members.
Only that read expectation was corrected; Remove was never repeated. These were
observer failures, not successful native execution falsely counted from a timeout.

Evidence checkpoint `03bb1bec` passes exact-source routine [CI37220894854](https://github.com/drrius/nest/actions/runs/37220894854). [CI record](ci-status.json). This routine workflow is separate from the actual native journey and the earlier shipping-native CI.

This bounded PDF pick/upload/restart/removal flow is verified on a simulator and the
real isolated backend. Other document providers, oversized/malformed picker input,
background upload interruption, a newly posted PDF, partner native viewing, full
VoiceOver and both physical phones remain open. Earlier controlled photo cleanup
replay has its own [evidence](../swiftui-native-receipt-recovery/README.md).
No shipping source/dependency change, production action, provider call, purchase,
worker activation, beta, or merge occurred. M7 acceptance remains incomplete.
