# Live services and fresh start

Updated 10 October 2026. This is the current work order authorized by the owner.
The historical Household OS migration and cutover requirements do not apply to
this fresh-start path. The old database stays untouched.

## 1. Household and data

- Supabase project `tkjixmujjoustdiedfmw` is now named `nest` and is the permanent backend.
- Real household `c24c01d9-cc89-42db-88aa-16f9ceebbb82` is now named `Nest`.
- Preserve real accounts. Leah must first sign in with Apple; her account was not present at the latest check. Match verified identity before adding membership.
- Three synthetic accounts and their separate fictional household remain for the bounded live checks. Remove identified fixtures after those checks; do not delete or repurpose real identity rows.
- Verify Money from both real accounts after linking. The existing one-member household is why Money is unavailable.

## 2. Live AI

- Owner added $20 to AI Gateway. The existing $1 non-renewing project budget remains in place during setup.
- OIDC is enabled via `NEST_AI_AUTH=vercel-oidc`; no permanent Gateway key was created.
- Deployment `dpl_BVdLUBioYGQnC3FgDDKVcs4wQCJs` serves the existing app alias. Its first real Swift assistant call reached the provider but failed.
- Root cause: Gemini rejects draft-07 tuple-array `items` in financial tool schemas. The adapter now converts only homogeneous tuples into bounded homogeneous arrays. Effect still validates exact tuple length and payloads before execution. Heterogeneous tuples fail explicitly.
- The owner-supplied meal-planning secret is stored server-side. Live assistant and generated meal/approval verification remain pending deployment of the fix.

## 3. Scheduling and push

- Owner explicitly authorized the Nest Supabase server key, scheduler tokens and worker activation in the existing Vercel project.
- Owner also explicitly authorized exporting the APNs key from the Mac's `~/Nest` folder to Vercel after an automatic-review denial. It is stored as a server-only secret.
- APNs Key ID `Z6JMSS52LC`, team `5ZKB6XKYFX`, production environment for TestFlight.
- Supabase server-key authentication passed a bounded read. TextEdit RTF formatting was removed before storing the corrected key.
- Separate push/recurring scheduler tokens are stored in Supabase Vault and Vercel, without printing their values.
- A serverless push entry point now reuses the existing bounded worker and closes its HTTP/2 client after each invocation. Push and recurring request traces use safe worker categories.
- Worker enablement, first live cycles, cron installation and physical delivery remain pending. The app's current build25 still has push disabled.

## 4. Native acceptance and beta

- Mac SSH and Xcode are available. Current source builds successfully for the simulator.
- The initial live AI smoke correctly failed on the provider schema defect; it is not counted as a pass.
- Run the fixed live read, generated meal/approval and a short four-tab/UI/offline pass. Do not repeat the historic QA matrix.
- Consolidate fixes and push enablement into one new private TestFlight build. Build25 remains the latest confirmed available build.
- Both owners must verify ordinary use, actual calendars and notification presentation on their phones.

## 5. Diagnostics and delivery

- Existing request IDs, privacy-filtered backend OTel logs and native diagnostics remain in place.
- The live failure was identified from model/operation logs without exposing prompts, tokens or household contents.
- Commit and push the current fixes, run affected checks and reconcile GitHub with the deployed source. Extra Sol review is waived by the owner.
- Vercel project is now `nest-api` with unchanged ID `prj_yN4ZNro5utMbzmyrSC3xgPZka67G`.
- Preserve `https://nest-test-api-drrius-projects.vercel.app` for installed clients. Renaming does not require an immediate endpoint change.
- No paid service purchase, public release, legacy database migration or old-app retirement is authorized by these tasks.
