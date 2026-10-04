# Retained draft confirmation: real test household and native recovery

4 October 2026. This is a bounded simulator/hosted check, not full financial or phone acceptance.

## Fixture and authorization

Only separate test project `tkjixmujjoustdiedfmw`, fictional household `be772ffd-3ab5-41d5-8438-647a79a553da`, was changed. Production was untouched. The fixture is one inactive legacy recurring rule and two pending CHF1.01 drafts with original 51/50-centime shares. Audited legacy DDL, deployed schemas and triggers were checked before seeding. The rollback check and subsequent guarded save preserve all preexisting financial events, allocations and ledger rows. See `fixture-plan.json` and `fixture-rollback-check.sql`; the saved fixture already exists and must not be seeded again.

Both ordinary test members read identical inventory, drafts and review contexts. Outsider/anonymous reads return403/401. Seeding adds no financial event or automatic posting mandate. `hosted-before.json` and `hosted-financial-history.json` preserve the original51-event baseline.

## UI findings and corrections

The initial observer tried selecting an amount field beneath the software keyboard and hit a prediction instead. The scratch description changed; no intent or POST was staged. The corrected observer dismisses the keyboard before switching fields and asserts exact field values. This is an observer finding, separate from the product changes.

The retained-confirmation editor only had keyboard Done; it now also offers Review using the existing validation/review action. Review and Done have44pt minimum targets. A real corner tap of Review reaches the explicit review without recording. OriginalCHF1.01 terms and the chosenCHF0.03 expense remain separate. Nine focused `LegacyConfirmationModelTests` pass on the signed native target, zero failures/skips; strict formatting and source limits pass.

The Money Saved changes disclosure had a28.5pt target; its label now provides a44pt minimum. The native observer reports two AX aliases with identical geometry. It deduplicates that geometry rather than treating them as two different controls. A real44pt corner tap discovers Draft confirmation after an offline process restart/client update with the uncertain SQLite request unchanged.

## Hosted financial outcome

One explicitly reviewed fictionalCHF0.03 expense was recorded: payer Test Alex, Alex share2centimes, Sam share1centime. The relay allowed only that exact draft/rule/review token/expense and one operation; it dropped the successful upstream reply and then made the API unavailable. The native client retained the exact unresolved request.

Independent ordinary-member reads prove exactly52 total events, all51 old summaries unchanged, zero-sum103/−103-centime balances and exact entry shares. The source draft is linked/posted while all its original amount/split/date fields remain intact; the other draft is unchanged. Every stored rule term remains unchanged and inactive; only derived draft counts change from2pending to1pending/1posted. Owner receipt is recorded; partner receipt is200/unresolved without private details; outsider/anonymous get403/401. See `hosted-after.json` and the before/after histories. Only typed UUIDs are normalized in the observer; financial values and descriptions are compared exactly.

## Recovery and restoration

After actual offline restart/client update, the native screen discovers the exact saved request through Money → Saved changes → Draft confirmation. Explicit Check and retry confirmation fetches the recorded receipt without another Save. The entry opens successfully; Finish recovery explicitly clears the resolved local slot. `complete.json`, `restart.json`, `recovered.json`, `recorded-entry.json` and the credential-free `requests.jsonl` record the journey. There is one upstream Save total.

The final signed app is rebuilt and restored to stable test origins and ordinary Today. Scoped expense/grocery/legacy-confirmation journals are empty; Keychain, app data and read snapshots are preserved. Only the owned relay is stopped and its generated localhost private key is destroyed. `restoration.json` records actual checks. The fixture and its append-only financial entry stay intact.

## Candidate stages and limits

Keyboard review and the one native confirmation used parent `5fec6011` plus the `LegacyConfirmationScreen.swift` change. Restart/recovery uses that source plus the `MoneyScreen.swift` target fix. `native-inputs.json` records all1,037 final native/build-helper input hashes. Existing CI proof for source `42813595` is a prior checkpoint; these new UI changes need their own current-source CI.

Normal text/light, actual signing, scoped SQLite and the real separate test API are involved. A controlled connection failure is not proof of physical radio loss. Largest text, VoiceOver, both phones, private approval/adoption/dismissal families and whole milestones remain open. These changes are newer than TestFlight15. No cloud build, production migration, source merge or release was performed for this check.
