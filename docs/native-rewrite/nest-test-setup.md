# Isolated hosted test backend

Created 26 September 2026 with owner authorization in `drrius's Org` on the Free plan; Supabase quoted USD 0/month. Project: `nest-test`, ref `tkjixmujjoustdiedfmw`, Zurich (`eu-central-2`). [Dashboard](https://supabase.com/dashboard/project/tkjixmujjoustdiedfmw).

Production `household-os` (`fdtqmcfwhbddswdpnmcq`) was not modified. This project contains fictional data only.

## Installed schema

The initial 55 legacy and 204 native source migrations were installed in batches. Sixteen subsequent conflict-handling migrations are installed, individually recorded in the manifest (275 source migrations total). [Source hashes and test-only adjustments](nest-test-migration-manifest.csv) record each input. Hosted migration batches cover these zero-based, end-exclusive slices:

| Hosted migration | Source slice                         |
| ---------------- | ------------------------------------ |
| `20260926090658` | legacy 0–4                           |
| `20260926090730` | legacy 4–7                           |
| `20260926090830` | legacy 7–8                           |
| `20260926090923` | legacy 8–18                          |
| `20260926091021` | legacy 18–36                         |
| `20260926091034` | legacy 36–55 (batch name ends in 54) |
| `20260926091055` | native 0–40                          |
| `20260926091126` | native 40–80                         |
| `20260926091141` | native 80–120                        |
| `20260926091214` | native 120–160                       |
| `20260926091244` | native 160–204                       |

Eight legacy cron-registration blocks were omitted. Search indexes use ordinary transactional creation instead of CONCURRENTLY on this initially empty database. The pg_net extension is included. Failed initial cron/index batches rolled back before corrected retries. No scheduled workers were enabled; the verified cron-job count was zero.

## Real Auth and access checks

Three fictional Auth users were created through the admin API, with random passwords and confirmed `example.invalid` addresses. No invitation or confirmation emails were sent. Password sign-in is a test harness only; the native app still uses Apple sign-in.

- Test Alex: `791f7261-6c9d-4061-9c8a-57aa6e0b0200`.
- Test Sam: `e5f80cfd-b69a-4aa0-a267-75784e943676`.
- Nonmember: `c9aef3f3-bfc1-4fd0-bf52-f8ab3f90d74e`.
- Fictional household: `be772ffd-3ab5-41d5-8438-647a79a553da`.

Both members received HTTP 200 from the local Nest API's `/v1/session` using real hosted Auth bearer tokens. The nonmember received 403; an anonymous request received 401. Hosted PostgREST household reads returned the one household for each member and zero rows for the nonmember. This is narrow real-service authorization evidence, not complete tenant-isolation or device acceptance.

Local `apps/api/.env` and `apps/mobile/.env` contain this project's URL and publishable key only and are ignored by Git. The mobile API origin is not configured yet. Temporary credentials/session state are mode 0600 files in `/tmp`; no server keys or passwords are committed.

## Outstanding checks

Every public ordinary table has RLS. Hosted security advisors reported 58 informational policy-absence notices and 80 callable SECURITY DEFINER warnings. After fictional password Auth fixtures were created, advisors also reported one leaked-password-protection warning; that remains unresolved. A follow-up catalog check found no anonymous callable public SECURITY DEFINER functions, no unsafe search paths on public Nest SECURITY DEFINER functions, and no anonymous/authenticated write grants on policy-free RLS tables. These checks do not dismiss all warnings; the remaining callable functions still need review. [Supabase function security guidance](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker).

Apple provider configuration, the partners' actual test identities, signed iPhone builds, hosted API access, live AI credentials, receipt Storage and push delivery remain unverified. No financial fixture or real household data has been imported. The schema installation and password-session checks do not satisfy M0–M9 acceptance.

## Hosted grocery conflict correction

The real hosted journey exposed repeated database `40001` errors for a stale grocery edit until the API timed out. SQL itself correctly rejected the stale version; hosted logs showed repeated attempts. Migration `20260926092224_native_grocery_nonretryable_conflicts.sql` changes explicit grocery edit business conflicts to `PT412`; genuine serialization failures retain their original code. The API maps HTTP 412/PT412 to its existing HTTP 409 conflict response. Existing private function identity and grants are preserved.

After applying only to nest-test, the complete real-user HTTP sequence passed: add and exact replay, partner read/check and exact replay, outsider denial, stale edit conflict, and unchanged final checked state. Retained fictional item: `644af67d-399c-4683-8e83-c434bba4e516`, version 2. A first diagnostic item also remains. Local PostgREST regression asserts the raw 412/PT412 response; the API mapping test and typecheck pass. This is not device/offline acceptance. Other explicit `40001` business-conflict sites still need a hosted retry audit.

The AI journal also catches PT412 in `20260926092453_native_ai_nonretryable_conflicts.sql`. Sixteen focused PostgreSQL cases pass, including a stale AI grocery edit returning a stored conflict, exact replay after another mutation, and one immutable journal entry. This fixes a review finding in the initial grocery correction; live model execution remains unverified. The follow-up migration is installed only on nest-test.

The same correction now covers stale grocery check/uncheck intent in `20260926092623_native_grocery_check_nonretryable_conflict.sql`. Actual hosted `/v1/groceries/check` returned the existing 409 conflict contract in 0.108 seconds for stale opposite intent, with the original item unchanged. Seventeen focused PostgreSQL/PostgREST cases pass, including the AI conflict journal and raw 412 response. Other command families remain under audit.

Chore completion now returns PT412 for its three explicit stale-state conflicts through `20260926092840_native_chore_nonretryable_conflicts.sql`. The migration asserts exactly three known clauses before replacing them in the retained function, preserving its identity, ACL, receipt replay and epoch adapters. Real hosted checks passed: fictional daily routine creation/replay, stale completion conflict in 0.102 seconds, successful completion/exact replay, and outsider rejection. The focused local PostgREST test asserts raw 412/PT412 and zero receipts for rejected stale intent. No real household data or device was involved.

Review found another terminal routine guard with differently spaced SQL. `20260926093101_native_chore_unavailable_conflict.sql` precisely replaces that one guard while preserving the real NOWAIT lock-retry branch. The HTTP fixture now includes the current closure-guard implementation and verifies paused-routine rejection with raw PT412 and zero receipts. This follow-up is installed on nest-test; the paused-routine HTTP case is locally verified, not separately hosted/device-verified.

Settlement migration `20260926093243_native_settlement_nonretryable_conflicts.sql` changes only explicit stale-balance and cancelled-Save conflicts in two retained functions. Eleven local HTTP/native-runtime cases pass: raw PT412 with unchanged financial-event count, authorization/approval enforcement, exact posting, and lost-response Save/Cancel recovery across SQLite restart. A real hosted stale-balance Save returned 409 conflict in 0.336 seconds; the hosted financial-event count remained zero. No actual financial transaction or device acceptance is claimed.

Expense migration `20260926093435_native_expense_nonretryable_conflicts.sql` changes only unavailable-receipt/category and cancelled-Save conflicts in three existing functions. A local raw PostgREST regression checks PT412 and unchanged financial-event counts for all three. The hosted unavailable-category Save returned 409 conflict in 0.333 seconds; financial-event count remained zero. The broader 18-case run includes AI command journaling and receipt approval. A fixture regression introduced by the grocery changes was corrected: grocery-only migrations now load in the grocery AI test, rather than leaking into derived money/recipe fixtures without grocery tables.

The combined local rehearsal with 54 legacy/211 native migrations passes financial reconciliation and committed receipt recovery; local advisors return no findings (`/tmp/nest-conflict-rehearsal-advisors.json`). pg_net, real Auth/Storage and external worker drainage remain outside this local proof. CI found a 403-line AI test file; its fixture setup was extracted and all 16 AI command cases plus full lint/format checks pass. Hosted advisors remain a separate unresolved review.

Preference migration `20260926094056_native_preference_nonretryable_conflicts.sql` changes explicit version conflicts for private food/notification settings and shared cooking settings. Ten local HTTP cases pass: raw PT412/no writes, normal saves, privacy, tenant boundaries, revocation and lost-response replay. Hosted stale calls returned PT412 in 0.283/0.081/0.077 seconds respectively for food/cooking/notifications. No real preferences or notification opt-ins were changed. AI, meal and other command families still need audit.

Calendar migration `20260926094310_native_calendar_nonretryable_conflicts.sql` changes five explicit stale/expired consent/capture raises across three retained functions to PT412. Six local HTTP cases pass, including delayed raw calls after opt-out that leave sharing disabled and no snapshots, personal-metadata rejection, expiry, membership incarnation changes and lost-response replay. Three hosted stale-identity RPCs returned PT412 in 0.119/0.054/0.052 seconds (capture/publication/consent); hosted snapshots and enabled consents both remain zero. Actual EventKit and two-phone permission behavior remain unverified.

AI turn migration `20260926094530_native_ai_turn_nonretryable_conflicts.sql` changes seven explicit ownership/revision/deadline conflicts across five retained definitions to PT412. Two new local HTTP cases verify competing turns, active-transcript protection, expiry refusal without command journals, stale revisions and exact interruption recovery; the existing maintenance recovery case also passes. Hosted catalog verification confirms all seven guards. A rolled-back hosted SQL probe verifies active-transcript refusal, expired completion refusal and successful interruption; this is not hosted HTTP, live model or device evidence.

Refund/correction migrations `20260926095056` and `20260926095104` change four terminal cancellation/stale-review guards in the retained record functions. Thirteen local HTTP/native-runtime cases pass, including raw PT412 rejection with exact event-history preservation, approval enforcement, lost responses and SQLite restart recovery. Installed on nest-test; catalog guard counts confirmed and hosted financial history remains empty. Actual hosted refund/correction execution is not yet verified. The separately audited AI proposal guards are caught inside the command journal and do not escape as retryable transport errors.

AI refund/correction conflict audit: the public command journal catches their stale-review exceptions and commits `{ok:false,code:"conflict"}`. A real PostgREST HTTP regression verifies both return HTTP 200 structured conflicts, exact replay produces only two journal rows, no approval is created and event history is byte-for-byte unchanged. Ten existing proposal database cases also pass. No additional SQL replacement is needed for these private proposal helpers.

Latest full synthetic rehearsal (`/tmp/nest-financial-conflict-rehearsal.json`): 54 legacy/216 native migrations, seven events/eight allocations/14 ledger entries and retained receipt reference reconciled, committed recovery passed, local advisors returned no findings. One pg_net exclusion and simulated Auth/Storage remain; external drainage and complete recovery remain unproven.

Private memory conflicts: migration `20260926095607` changes three terminal stale-state/expired-consent/capacity raises to PT412. Six local HTTP cases pass, including raw expired-consent rejection with no memory/receipt writes and approval still pending, privacy, exact replay, stale revision and capacity recovery. Installed on nest-test and catalog counts confirmed; hosted execution and native-device behavior remain unverified.

Chore edit/handover conflicts: migration `20260926095847` changes nine terminal guards across five retained functions, preserving both chore edit/transfer lock-contention handlers as retryable. Six local HTTP cases pass: stale date/request/version raw PT412 with unchanged occurrence/assignment/pause state, acceptance, exact replay after rebuild, tenant and revoked-access denial. Hosted catalog confirms nine terminal guards and the two preserved contention guards; hosted behavioral/device checks remain outstanding. Both fixture files are included in routine conflict CI (26 cases total).

Renewal/reminder conflicts: migration `20260926100146` changes three terminal stale-baseline guards across the renewal edit and public reminder Save functions. Seven local HTTP/client cases pass, including raw PT412 with unchanged renewal/no reminder or money, tenant denial, cancelled requests, exact lost-response replay and forged-receipt rejection. Installed on nest-test and catalog counts confirmed. Hosted execution/native-device checks and the separate legacy conversion command remain unverified. The raw regression is included in routine conflict CI (27 cases total).

Recurring conflicts: migration `20260926100455` changes 23 explicit terminal guards across nine retained configuration/state/resume/variable/fixed/manual functions. Three focused integration cases exercise five stale HTTP command paths, the fixed-cycle SQL boundary, four cancelled Save paths, exact manual-link replay and valid variable posting with zero ledger sum/no duplicate cycle. Full synthetic 54-legacy/220-native schema, financial reconciliation, committed recovery and local advisor gate pass (`/tmp/nest-recurring-conflict-rehearsal.json`). Installed on nest-test and all 23 guard counts verified; actual hosted recurring execution remains unverified and no scheduler was activated. Added to routine conflict CI (30 cases total). Legacy adoption/conversion and other remaining command families still require audit.
