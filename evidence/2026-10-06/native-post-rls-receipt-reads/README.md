# Native receipt reads after internal-table RLS

Two actual native GET-only methods passed after the parent-applied nest-test migration `20261006161050` / `native_internal_rls`: Alex in 15.445 seconds and Sam in 12.294 seconds. Each ran `HostedActiveRecurringReminderReceiptReadTests/testGETOnlyRecordedReminderAndBothImmutableOperations` once. No Save, Done, UI acceptance method, financial command, permission change, provider diagnostic or SQL action was invoked by this controller.

Alex recovered the original rule creation operation `5bdfcaeb-3f20-4fa3-9db9-0f0902eede8f` and item-reminder operation `f23e5dfb-cc10-4199-a0f1-bc2cfcbd521c` as their exact immutable recorded receipts. Sam's requests for those same operation IDs returned unresolved with no private receipt, bound to Sam and the fictional household. Both read the same enabled Both/09:00 Europe/Zurich/lead1 reminder, revision `f736854d-935a-4433-ba0c-13a4b5e51ac6`, for the existing active variable rule `f854e3a3-ffda-4eb7-86e5-d3933d938444`.

The mandatory baseline comparison preserved the complete 62-event terminal history, Alex +1/Sam −1 centime balances, roster, all eight exact rule DTOs, seven original inactive rules and both known removed-renewal/reminder histories. Each reader used the previously captured immutable request and references; neither established a replacement baseline. These results demonstrate the tested native receipt/canonical access after RLS, not a complete RLS policy audit. The parent owns catalog/advisor and migration evidence.

The executed SDK source is immutable `6997138485f3f8088fc03682432de74879e19659`, with 1,122 native inputs. The current mirror/source differs and was not claimed as this executed build. Selected SDK products, all three binary hashes, strict signing, build19 and fixed test origins were revalidated against the recorded Save proof before either method. JSON reference values were independently hash-bound to that proof. No rebuild or consumed-controller import occurred: only the proven read functions were copied into the new bounded controller.

After both methods, original actor/household scopes and all 64 empty journals matched the before state. Measured large/light settings were restored, owned plans removed and scoped caffeinate stopped. Ordinary foreground launches returned both simulators to Today/Me + shared. The two terminal screenshots were directly viewed and show only the authorized fictional scope; they are restoration captures, not additional UI acceptance methods.

Raw xcresults and credential-bearing selected plans/configuration remain private on the authorized Mac. Only sanitized native records, logs, summaries, manifest metadata and terminal screenshots are exported. No credentials or response tokens are included.

Run the immutable read-only verifier:

```sh
python3 evidence/2026-10-06/native-post-rls-receipt-reads/verify_inventory.py
```

It checks tracked artifacts/hashes, the 699 source map and reused product attestation, exact receipts/canonical equality, two passing methods, original-scope restoration and the two actual visual reviews. It performs no native or API action.
