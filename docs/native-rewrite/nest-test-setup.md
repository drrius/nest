# Isolated hosted test backend

Created 26 September 2026 with owner authorization in `drrius's Org` on the Free plan; Supabase quoted USD 0/month. Project: `nest-test`, ref `tkjixmujjoustdiedfmw`, Zurich (`eu-central-2`). [Dashboard](https://supabase.com/dashboard/project/tkjixmujjoustdiedfmw).

Production `household-os` (`fdtqmcfwhbddswdpnmcq`) was not modified. This project contains fictional data only.

## Current APNs test installation — 30 September 2026

After the complete 54-legacy/244-native fixture rehearsal and passing source/deep CI, the following unchanged, hash-checked sources were applied only to nest-test:

| Source migration                                          | Hosted version   |
| --------------------------------------------------------- | ---------------- |
| `20260929220335_native_apns_registration.sql`             | `20260930014440` |
| `20260929221917_native_apns_delivery_outcomes.sql`        | `20260930014449` |
| `20260930012204_native_recent_journal_write_barriers.sql` | `20260930014455` |

Full financial-row and original device-operation projections had identical before/after hashes, preserving 13 events and two operations. No write freeze, worker or schedule was activated. The hosted barrier assertion passes; all three newly guarded private journals have RLS and ALWAYS statement triggers. Current advisors report 61 policy-absence INFO, 81 callable-definer WARN and one leaked-password-protection WARN. These remain separate from the clean local fixture advisor report.

The API at `https://nest-test-api-drrius-projects.vercel.app` now aliases verified preview deployment `dpl_AXFV8bWxhygAfd7D3QQyi65hXtrZ` (`https://nest-test-85rurh9o7-drrius-projects.vercel.app`), built from server source `8fbe67d8`. This project configures its isolated backend in Preview only. Deploy from the repository root using the exact test project ID, without `--prod`; verify the immutable deployment before assigning the stable alias. `.vercelignore` excludes local credentials, workspace metadata and non-runtime artifacts. A failed production-target test deployment had no backend configuration; its stable alias was restored before retrying in Preview. No environment secrets were copied. The subsequent bounded nonsecret AI configuration and rollback are recorded below.

The real Swift registration test passes (one case, no failures/skips, 14.157 seconds): outsider denial, register/exact replay/read/recovery, stale-revision refusal, cancellation enforcement, exact disable/replay and retained historical registration receipt. It uses random synthetic sandbox token bytes, not an Apple token. Final catalog: one inactive APNs fixture device, zero retained token/hash, four total device operations (two preexisting plus registration/disable), zero APNs attempts, zero cron jobs and 13 financial events. The full event/allocation/ledger fingerprint still equals the pre-migration baseline `7c5dd62f66b723e089f44a9917b10e063790b5bd1482ac19d7c84514be9796a8`. Cancellation is retained in its separate journal. No Apple send occurred. This is hosted contract/authorization evidence, not native permission, hardware enrollment or delivery acceptance.

Earlier dated entries below retain their historical counts and verification boundaries; they do not describe the current deployment.

## Live AI check and rollback — 30 September 2026

Temporary nonsecret Preview settings selected `google/gemini-3-flash` with explicit `vercel-oidc`. Two real Swift read-only assistant checks failed with interrupted turns and no tool results; sanitized diagnostics report Gateway HTTP403. A separate synthetic 32-token/no-retry probe confirms valid-card eligibility is still required, with credits/usage 0/0. Temporary capped keys were revoked and existing key IDs preserved. See [sanitized evidence](../../evidence/2026-09-30/swiftui-live-assistant/README.md).

The stable API now again points to the prior working `dpl_AXFV8bWxhygAfd7D3QQyi65hXtrZ` Preview. `NEST_AI_AUTH` was removed from Preview; the selected model remains but cannot enable AI alone. Both temporary AI-enabled Previews were removed after restoring the alias. A real member read verifies assistant `available:false`; financial history/hash remain unchanged. Live AI and planning are unverified. No secret download, purchase, production change or top-up occurred.

## Installed schema

4 October receipt cleanup update: hosted migration `20261004135633`
(`native_receipt_legacy_cleanup_owner`) applies source
`20261004134604_native_receipt_legacy_cleanup_owner.sql` only to `nest-test`.
The source checksum is recorded in the manifest; hosted function bodies/ACLs match
and complete financial/attachment digests remain unchanged. [Evidence](../../evidence/2026-10-04/legacy-receipt-cleanup/README.md).
The current source manifest contains55 legacy and249 native inputs. Historical
batch counts below describe the earlier installation.

For every new migration, record its exact source checksum in
`nest-test-migration-manifest.csv` and run
`node tools/migration/verify-test-manifest.mjs` before pushing or applying it.
The checksum gate remains required alongside meaningful database verification.

The initial 55 legacy and 204 native source migrations were installed in batches. Forty subsequent native migrations are installed, individually recorded in the manifest (299 source inputs: 55 legacy and 244 native). The read-only `node tools/migration/verify-test-manifest.mjs` gate checks every current native file and its exact SHA-256; it does not prove hosted runtime equality, legacy-source hashes or data reconciliation. [Source hashes and test-only adjustments](nest-test-migration-manifest.csv) record each input. Hosted migration batches cover these zero-based, end-exclusive slices:

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

Apple provider configuration, the partners' actual test identities, signed iPhone builds, a remotely reachable API deployment, live AI credentials and push delivery remain unverified. The local API has exercised real test Storage and fictional financial data as recorded below; no real household data has been imported. The schema installation and password-session checks do not satisfy M0–M9 acceptance.

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

Historical full synthetic rehearsal (`/tmp/nest-financial-conflict-rehearsal.json`): 54 legacy/216 native migrations, seven events/eight allocations/14 ledger entries and retained receipt reference reconciled, committed recovery passed, local advisors returned no findings. One pg_net exclusion and simulated Auth/Storage remain; external drainage and complete recovery remain unproven.

Private memory conflicts: migration `20260926095607` changes three terminal stale-state/expired-consent/capacity raises to PT412. Six local HTTP cases pass, including raw expired-consent rejection with no memory/receipt writes and approval still pending, privacy, exact replay, stale revision and capacity recovery. Installed on nest-test and catalog counts confirmed; hosted execution and native-device behavior remain unverified.

Chore edit/handover conflicts: migration `20260926095847` changes nine terminal guards across five retained functions, preserving both chore edit/transfer lock-contention handlers as retryable. Six local HTTP cases pass: stale date/request/version raw PT412 with unchanged occurrence/assignment/pause state, acceptance, exact replay after rebuild, tenant and revoked-access denial. Hosted catalog confirms nine terminal guards and the two preserved contention guards; hosted behavioral/device checks remain outstanding. Both fixture files are included in the explicitly dispatched deep conflict suite (26 cases total).

Renewal/reminder conflicts: migration `20260926100146` changes three terminal stale-baseline guards across the renewal edit and public reminder Save functions. Seven local HTTP/client cases pass, including raw PT412 with unchanged renewal/no reminder or money, tenant denial, cancelled requests, exact lost-response replay and forged-receipt rejection. Installed on nest-test and catalog counts confirmed. Hosted execution/native-device checks and the separate legacy conversion command remain unverified. The raw regression is included in the explicitly dispatched deep conflict suite (27 cases total).

Recurring conflicts: migration `20260926100455` changes 23 explicit terminal guards across nine retained configuration/state/resume/variable/fixed/manual functions. Three focused integration cases exercise five stale HTTP command paths, the fixed-cycle SQL boundary, four cancelled Save paths, exact manual-link replay and valid variable posting with zero ledger sum/no duplicate cycle. Full synthetic 54-legacy/220-native schema, financial reconciliation, committed recovery and local advisor gate pass (`/tmp/nest-recurring-conflict-rehearsal.json`). Installed on nest-test and all 23 guard counts verified; actual hosted recurring execution remains unverified and no scheduler was activated. Added to the explicitly dispatched deep conflict suite (30 cases total). Legacy adoption/conversion and other remaining command families still require audit.

Meal edit conflicts: migration `20260926100816` changes 14 terminal guards across six retained placement/move/replacement/removal/leftover functions, preserving their five original exception-handler translations. A local HTTP journey verifies five stale requests return PT412 with identical meal and linked-preparation rows, fresh placement replays exactly, and a fresh removal closes the linked preparation and replays. The latest full synthetic rehearsal (`/tmp/nest-meal-conflict-rehearsal.json`, 54 legacy/221 native) passes financial reconciliation, committed recovery and the local advisor gate; prior infrastructure/device limitations still apply. Installed on nest-test; catalog verifies 14 terminal guards and five retained handler guards. Hosted movement, replacement, leftovers and preparation behavior remain unverified. Added to the explicitly dispatched deep conflict suite (31 cases total).

Hosted meal/memory follow-up after `bf044e4`: actual API → nest-test meal placement and exact replay, partner read, stale removal (409 in 0.081s), outsider denial, current-revision removal and replay pass. Original visible meal entries are restored; synthetic tombstone/receipt history remains. Private memory proposal remains inactive before explicit confirmation; confirmation/replay, partner denial and nonvisibility, stale removal (409 in 0.084s), removal/replay and original visible list restoration pass. An initial memory probe used forbidden revision zero and correctly returned 400; it was cleaned up through the normal removal command and rerun with stale positive revision 99. Harnesses: `/tmp/nest-hosted-meal-check.py`, `/tmp/nest-hosted-memory-check.py`. These are real hosted API journeys, not native-device proof.

Recipe conflicts: migration `20260926101436` changes 21 terminal guards across ten retained CRUD/library/capture/selection functions while preserving four existing handler 40001 translations and all numeric-validation tails. A local HTTP journey verifies create replay, five stale writes/selections with exact library/ingredient/entry/snapshot preservation, stale planned reads, and successful archive without changing the already captured plan. Installed on nest-test; catalog confirms all 21 terminal and four retained guards. Hosted recipe behavior and device execution remain unverified. Added to the explicitly dispatched deep conflict suite (32 cases total).

## Hosted receipt byte verification

The local real upload handler successfully wrote an existing synthetic JPEG fixture to test Storage, verified its SHA-256 and exact bytes, replayed the upload, denied partner/outsider access to the pending receipt, and deleted it through the normal cleanup API. A fresh final lookup returned not found; zero stored objects and zero financial events remained. Earlier probes found the legacy household-wide Storage SELECT policy bypassed the API's pending-receipt privacy. Migration `20260926103200` adds a restrictive policy for native identities: only the uploader may read before posting; both current household members may read a financially referenced receipt. Legacy attachment behavior is unchanged. Owner reads while deleting permit Storage cleanup. Local RLS tests cover pending/shared/outsider/anonymous/deleting/legacy cases.

Previously authorized object URLs returned Cloudflare cache hits after policy changes and deletion, including after an upload with `Cache-Control: no-store`; a fresh query key correctly returned not found. The upload service now requests `no-store` to discourage client retention, but this does not prove immediate CDN revocation. Do not claim deletion retracts bytes already downloaded or cached. Harness: `/tmp/nest-hosted-receipt-verified.mjs`. Subsequent signing and claimed-expense checks are recorded below. Edge deployment and native capture/viewer execution remain unverified. All data used was fictional; production was untouched.

Receipt claim review fix: migration `20260926103844` requires the native uploader for the first claim under the existing attachment row lock. A partner claim is rejected without changing financial events, ledger, upload state or byte visibility; the uploader can then post normally. The local receipt RLS regression and three push conflict cases pass (4/4). Installed only on nest-test; exact-commit review and CI remain pending. Hosted push checkpoint probes returned 412 for all six stale revisions in 0.115–0.163 seconds with unchanged checkpoints; no notifications were sent.

Subsequent hosted signing/claim verification: the actual local API signed the pending uploader receipt and returned exact JPEG bytes while rejecting the partner/outsider. A partner first-claim attempt returned 403; the owner then saved and exactly replayed one fictional CHF 1.01 expense. Both household members could obtain signed bytes after claim; the outsider remained denied. Catalog reconciliation found one event, one stored object, one claimed upload and net ledger delta zero. These test records remain as append-only history. Earlier zero-object/zero-event counts describe prior cleanup probes. Harnesses: `/tmp/nest-hosted-receipt-signing.mjs` and `/tmp/nest-hosted-claimed-receipt.mjs`. These do not prove iPhone execution.

## Latest retained completion-date guard

Manifest provenance now covers55 legacy and250 native sources. Migration
`20261004143015_native_legacy_completion_dates.sql` is installed only here under
hosted version `20261004144314`. New invalid/future dates are denied; old exact
receipts and history are retained. Seven focused local tests,21 full-chain parent
checks and ten real Auth/PostgREST negative probes pass, with complete52-event
finance, attachments and routine-history digests unchanged. Exact-source routine
and deep CI pass c5469baf; hosted advisors remain61 INFO/81 privileged WARN/one
leaked-password WARN. [Evidence and remediation links](../../evidence/2026-10-04/legacy-completion-date-boundaries/README.md).
No successful hosted completion, native run or production change is claimed here.
