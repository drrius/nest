# Nest progress

Updated 10 October 2026. The goal remains active and incomplete. SwiftUI is the
shipping iPhone client under [ADR 0002](adr/0002-swiftui-client.md). Expo and React
Native are removed. The agreed product scope, Effect backend, financial history
and privacy rules remain authoritative.

## Current build

**SwiftUI 0.1.0, build 26 is available for internal TestFlight testing.** Its frozen
source is `559ee9ab43f9ce8e1cf3f3226d8201f8b68e61c6`. Apple reports VALID,
IN_BETA_TESTING and unexpired. One private submission finished; no further upload
is needed. See the [current live-service status](native-rewrite/live-service-checklist.md).

It uses the permanent Nest Supabase/API and enables signed APNs push. It includes
the earlier layout/privacy fixes, Money's missing-partner explanation and
Profile → Diagnostics. [Debugging guide](native-rewrite/diagnostics.md).
Installation of this version, partner tester access and full phone acceptance
remain unverified. Use the [short phone pass](native-rewrite/build25-first-phone-pass.md)
and [full acceptance checklist](native-rewrite/swiftui-phone-acceptance.md).

Source work runs on Linux at `/home/drrius/Work/nest`; signed Xcode builds and
simulator journeys run on the authorized Mac. The original clients, credentials,
local journals and settings are preserved. The complete implementation is consolidated on
`main`; no old-database cutover or public release occurs.

## Current priority

The owner approved a fresh start on the renamed `nest` database, keeping real accounts and excluding Household OS migration. Follow the [current five-step checklist](native-rewrite/live-service-checklist.md); historical migration blockers below no longer gate this path.

Owner requests practical diagnostics and focused simulator checks, without expanding
unchanged QA variants. Money failure (historical artifact removed)
is confirmed: the owner test household has one member. Verified partner linking
remains needed. Native/server diagnostics and clear setup errors pass focused checks. Server
traces and private AI timing are deployed; native diagnostics ship in build25.
Next beta: stream diagnostics (historical artifact removed) pass ten Mac checks; Auth diagnostics (historical artifact removed) pass four Mac/two simulator checks.

## Milestone checklist

Unchecked means full acceptance remains open. Implementation and bounded tests
are credited without claiming live-provider or physical-device verification.
The [remaining acceptance list](native-rewrite/remaining-work.md) links detailed
journey evidence and identifies the uncovered requirements.

- [x] **M0, decisions and native execution.** ADRs, action inventory, signed execution, source/build identity and scoped four-tab smoke pass. Foundation audit (historical artifact removed).
- [ ] **M1, Quiet UI.** Shared tab headers/insets and real screens exist. Selected light/dark and Dynamic Type journeys pass. Contrast reports, populated/error/keyboard usability, VoiceOver, Reduce Motion and owner acceptance remain open.
- [ ] **M2, authenticated offline and AI slice.** Keychain, scoped SQLite, authorization, operation receipts and tested recovery exist. Successful live streaming/tools/approval and phone offline acceptance remain open.
- [ ] **M3, identity and setup.** Apple sign-in, independent onboarding, editable preferences and private memory exist with account/privacy tests. Both-phone sign-in, interruption/recovery and complete setup acceptance remain open.
- [ ] **M4, Today, chores and groceries.** Commands and AI tools exist. Two simulator clients demonstrate retries, restarts, conflicts and schedule/skip/archive races. Hardware radio loss, haptics, remaining access-revocation variants and uncoached daily use remain open.
- [ ] **M5, Meals.** Manual week, recipes, placement/move/leftovers, ingredients, preparation and portion persistence have bounded native evidence. Live generation/replacement/approval, varied estimates and the full partner phone journey remain open.
- [ ] **M6, Calendar.** EventKit, selection, layers and opt-in busy-only sharing exist. Bounded timed/all-day/DST/privacy checks pass. Real calendars on both phones, revocation, background/stale/offline behavior and full privacy acceptance remain open.
- [ ] **M7, Money.** Append-only ledger invariants, financial approvals, full/partial native posting, receipts and selected lost-reply/cancellation recovery pass. Remaining races/AI handoffs, scheduled-cycle acceptance and both-phone financial journeys remain open.
- [ ] **M8, reminders and push.** Renewals, preferences, enrollment/outbox/worker source and focused tests exist. APNs credentials, authorized worker configuration and actual six-kind delivery on both phones remain open.
- [ ] **M9, migration and release.** Disposable schema/domain reconciliation and rollback/retry rehearsals pass. Trusted writers, pending intents, authorized existing-data rehearsal, complete UX acceptance and final release/cutover gates remain open.

## Verification

Build 23's exact source passes routine CI
[37660682366](https://github.com/drrius/nest/actions/runs/37660682366) and native CI
[37660682517](https://github.com/drrius/nest/actions/runs/37660682517). Native CI
reports 512 app tests, 59 guarded skips and zero failures, with strict formatting,
source limits, signing and guarded UI compilation also passing. Local signed
archive/export, package configuration and all 1,188 frozen inputs match. Skips and
UI compilation do not establish phone or live-provider execution. Build 22's
previous evidence stays retained; it is superseded as the phone candidate.

Hosted test-backend journeys include two-client chore/grocery recovery, manual
meal planning, append-only financial posting and PDF access. Later variable-bill
lost Save and cancellation replies recover with preserved request identities;
managed Storage rejects an expired receipt URL while a fresh authorized URL
returns the same bytes. Their evidence and limits are linked in the remaining list.
Production data was not used for those writes.

A standalone native contrast diagnosis now reproduces below-tab-bar failures
using standard SwiftUI colors, including with Nest's bottom fade hidden. Three
unfiltered simulator audits retain three failures; they are diagnostic evidence,
not passing Nest tests. All paragraph coordinates match the no-tab control.
Both owned simulators are deleted and original scopes, 64 journals per client,
display/private choices and application paths match exactly.
Probe and limits (historical artifact removed).
The current Nest full audit remains failed. Fully visible contrast, VoiceOver,
Reduce Motion, phone readability and owner acceptance stay open. No palette or
navigation workaround is added for this diagnosis.

The authorized nest-test catalog now confirms installed pg_cron, full catalog
visibility and zero registered jobs at 12:21 UTC. All eight audited legacy
entry-point definition hashes and definer flags match the current compiled
migrations. Local/hosted owner identities differ and remain recorded. The new
source-parity comparison uses a disposable 54-legacy/257-native compilation;
production, private dependency semantics, owner capability equivalence and
external drainage remain open. No job is run or changed.
Hosted checkpoint (historical artifact removed).
The native diagnosis source `240ed33b` passes routine
[CI 37619852843](https://github.com/drrius/nest/actions/runs/37619852843); the hosted
inventory/source-parity source `971b2069` passes
[CI 37621917353](https://github.com/drrius/nest/actions/runs/37621917353).
The rerunnable comparison source `6ef3c4b7` also passes
[CI 37623018040](https://github.com/drrius/nest/actions/runs/37623018040).
Neither check changes the retained failures or closes M1/M9 acceptance.

Money history now groups its rows instead of inheriting page-level gaps. The
signed baseline fails on an extra 24-point gap; corrected Money preview and full
history journeys both pass without skips, and all three screenshots are inspected.
The shared section heading, 20-point margins and minimum 52-point row targets
remain. Original binaries, scopes, 64 journals and settings restore. This is a
shipping UI fix after build 22; no new beta is submitted. Source `7f5d1bd3` passes
[routine CI 37632180353](https://github.com/drrius/nest/actions/runs/37632180353).
[Native CI 37632180145](https://github.com/drrius/nest/actions/runs/37632180145)
also passes with 498 app tests, 56 guarded skips and zero failures. The two local
UI journeys ran separately without skips. Keep their passing evidence unless an
affected change or failure requires another run. Evidence (historical artifact removed).

Today now shows its scoped saved meals before the network reply and preserves
them during refresh/unavailability. The card labels saved data, clears on
non-network failures and resets across session generations/civil days. Five
signed session/SQLite checks pass without skips; a controlled native card capture
shows the saved meal during a held read and afterward. The final olive-tint
capture method passes without skips; both screenshots are inspected. Source
`96ce536b` passes [routine CI 37635279113](https://github.com/drrius/nest/actions/runs/37635279113).
[Native CI 37635279186](https://github.com/drrius/nest/actions/runs/37635279186)
also passes, with 502 app tests, 57 guarded skips and zero failures. This is local native proof with controlled
HTTP, not hosted/phone acceptance. Build 22 stays unchanged.
Evidence (historical artifact removed).

A known forbidden meal-week read now removes that actor/household/week's local
read snapshot in Today and Meals. The baseline exposes the denied cache; four
corrected signed app cases and one SQLite restart/scope check pass without skips.
Uncertain operations and partner snapshots remain intact. Concurrent old replies,
hosted revocation and phone behavior remain unverified. Current-source CI is
pending for later source. The sequential-denial source `bb3d93a5` is pushed and
passes [routine CI 37637534983](https://github.com/drrius/nest/actions/runs/37637534983).
[Native CI 37637535002](https://github.com/drrius/nest/actions/runs/37637535002)
also passes, with 504 app tests, 57 guarded skips and zero failures.
Evidence (historical artifact removed).

Late meal-week replies now pass through one scoped SQLite read epoch. A denial
atomically invalidates older replies and deletes the snapshot; every shipping
week-cache writer uses the shared command. The held-success baseline fails by
restoring denied data. Both corrected reply orders, 34 affected signed app cases
and six SQLite checks pass without skips. Pending journals survive, old tickets
remain invalid after reopening and a new authorized read recovers. Hosted and
other read-only-path revocation remain open. Race source `4192478a` is pushed in
`f3931206`. [Routine CI 37639324481](https://github.com/drrius/nest/actions/runs/37639324481)
and [native CI 37639324200](https://github.com/drrius/nest/actions/runs/37639324200)
pass. Their exact source is `f3931206`; the separate local controlled race cases
remain the direct late-reply proof.
Evidence (historical artifact removed).

Planned recipe and preparation read copies now share the scoped week fence.
Known denial removes the copies and selected detail; old replies cannot restore
them, while pending commands remain intact. Both baseline regressions fail as
expected. Fourteen corrected signed app cases and fourteen SQLite cases pass
without skips, including normal offline/absence behavior and recovery. Hosted,
rendered-phone and other read-only-path acceptance remain open. Current-source CI
is pending for later source. Detail source `91c06917` passes
[routine CI 37641010696](https://github.com/drrius/nest/actions/runs/37641010696);
[native CI 37641010744](https://github.com/drrius/nest/actions/runs/37641010744)
also passes, with 508 app tests, 57 guarded skips and zero failures. Evidence (historical artifact removed).

All remaining shipping week reads now use the shared fenced command, including
proposal preview, ingredient refresh and mutation preflight. Ingredient read
updates validate the same ticket atomically with the saved-choice sequence;
exclusions and pending additions remain intact. A held proposal reply fails
before the fix. Thirty-two corrected signed app cases and nine SQLite cases pass
without skips, including existing approval/retry/offline behavior. Hosted, live-AI
and phone acceptance remain open. Current-source CI is pending.
Evidence (historical artifact removed).

Audited writer owner attributes are now measured from nest-test catalog metadata.
Its postgres owner is non-superuser with BYPASSRLS; the fresh disposable fixture
bootstrap is superuser with BYPASSRLS. Other measured role flags match. This
confirms a real privilege-fidelity gap instead of assuming equivalent owners;
effective table/function grants, private dependencies and production remain open.
No roles, data or schedules change. The small fixture is stopped and the completed
311-migration rehearsal is not repeated.
Evidence (historical artifact removed).

The disposable migration rehearsal now uses a distinct owner, lowered from
superuser before runtime checks. All 311 migrations apply and both financial
reconciliations pass under the revised runner. Seven focused fixture/runtime/
lifecycle tests pass without failures or skips. Measured role flags match nest-test;
Auth/Storage grants and API-role membership remain simulated, so full hosted
permission equivalence and production readiness remain open. The earlier public
schema permission failure is retained. This closes a local rehearsal gap without
another native build. Evidence (historical artifact removed).

Runtime-owner source `f1cff427` is delivered on the feature branch. Its routine
[CI 37644412576](https://github.com/drrius/nest/actions/runs/37644412576) passes.
Native [CI 37642938666](https://github.com/drrius/nest/actions/runs/37642938666)
is terminal/cancelled, with one account-switch error-contract failure in its log.
The failure is corrected below; current-source CI remains required. The phone acceptance
guide now identifies build 22's actual frozen source and working short-checklist
link, and separates later history/cache fixes from that available candidate.

Actual EventKit permission revocation/restart now has two signed app-hosted
checks passing without failures or skips on a fresh simulator. A synthetic local
event reads with granted access; denied access clears saved selection and refuses
event/busy reads after a separate launch. The fixture explicitly flushes its
marker after an initial transport failure, retained in evidence. Both owned
simulators are deleted. Shipping Calendar code and build 22 stay unchanged.
The EventKit test and corrected phone guide are delivered in `93e59c04`. Rendered UI,
initial permission prompts, live sharing and both phones remain open. Evidence (historical artifact removed).

The failed ingredient account-switch contract now rechecks caller context when
the shared week read throws. The exact failed method and affected library,
ingredient and denial-race cases pass in 21 signed app tests, without failures or
skips. The original CI failure remains recorded; current-head CI is pending for
this correction. No test expectation is relaxed, hosted data is untouched and
build 22 stays unchanged. Evidence (historical artifact removed).

Source `93e59c04` now passes [routine CI 37646179922](https://github.com/drrius/nest/actions/runs/37646179922)
and [native CI 37646179888](https://github.com/drrius/nest/actions/runs/37646179888).
Native CI reports 512 app tests, 59 guarded skips and zero failures, including the
corrected ingredient account-switch contract. The explicit EventKit cases retain
their separate two-pass local evidence.

Direct correction/refund posting now completes a resumed signed native journey
through the hosted test API. One fictional CHF 0.02 expense is replaced and fully
refunded using exactly three commands. Four events remain appended, all prior
financial row hashes match, every new ledger event is zero-sum and both balances
return to their starting zero. The final native invocation passes without skips;
initial observer/target failures remain retained. The correction picker target is
now 44 points high. Original scope and all 64 command journals match; the owned
clone is deleted. A reported invalid-frame runtime warning remains open. Partner
rendering is verified below; phones, live AI and broader variants remain open. Build 22 stays
unchanged. Evidence (historical artifact removed).

The second fictional member now reads the four exact correction/refund-chain
entries through native Financial history and the hosted test API. The read-only
signed case passes without failures, skips or runtime warnings. The full financial
snapshot is unchanged after reading. Original Sam scope and all 64 command
journals match; its owned clone is deleted. The earlier standalone keyboard
warning diagnosis already reproduces the writer's warning message on this runtime;
current writer stack identity is unavailable, so phone/runtime acceptance stays
open. No new probe or financial posting is used for that diagnosis.
Evidence (historical artifact removed).

Picker/posting source `50276391` passes [routine CI 37651420402](https://github.com/drrius/nest/actions/runs/37651420402)
and [native CI 37651420448](https://github.com/drrius/nest/actions/runs/37651420448).
The separately executed partner reader has its local passing evidence; its updated
source still requires CI after delivery. No current CI run is cancelled to push it.

A direct fixed recurring-rule create/pause/cancel journey now passes through
signed native UI and the hosted test API without failures or skips. Its explicit
review covers a future first due date and CHF 0.02 split into two centimes. The
exact test rule ends cancelled, with mandate attribution retained. All ten older
rule hashes and the complete financial snapshot match. No scheduler is enabled;
pg_cron has zero registrations at both checkpoints. The recurring pickers now
use 44-point targets. Its original observer failure and runtime warning remain
recorded. The owned clone is deleted and original scope/64 journals match.
Editing/resumption, manual linkage, actual scheduling, AI and phones remain open.
Evidence (historical artifact removed).

Recurring-control source `d565cbb1` passes both
[routine CI 37656565916](https://github.com/drrius/nest/actions/runs/37656565916)
and [native CI 37656566076](https://github.com/drrius/nest/actions/runs/37656566076).
A direct variable-rule journey now records exactly five revisions through native
UI: creation, note edit, pause, explicit prospective resume and cancellation.
Earlier observer failures are retained; completed writes are resumed rather than
replayed. The final cancellation suffix passes one signed native test with no
failures or skips. All eleven older rule hashes and every financial row match;
both balances remain zero and cron registrations remain zero. The owned clone
is deleted after all 64 journals are empty; original scope/journals and source
hashes match. The new guarded test source passes the exact-source CI recorded above.
Evidence (historical artifact removed).

The remaining-work list now preserves earlier direct manual-link and retained
confirmation/dismissal/adoption evidence instead of scheduling repeated writes.
Later Quiet presentation, private live approvals, scheduling and phones retain
their separate acceptance requirements.

The migration fixture now models the observed separate Auth/Storage schema and
table owners, explicit runtime data grants and RLS. Catalog-only nest-test reads
inspect no users, sessions, objects or credentials. Nine focused database checks
pass; the full 54-legacy/257-native rehearsal completes with both financial and
receipt reconciliations passing. Local managed-DDL/role refusal is verified, but
hosted administrative hooks and full permission parity are not claimed. Provider
interfaces, remaining grants, private semantics, external writers and production
rehearsal remain open. Build 23 is unchanged; current-source routine CI is pending.
Evidence (historical artifact removed).

Managed-ownership source `e0e037b1` passes
[routine CI 37667651167](https://github.com/drrius/nest/actions/runs/37667651167).
A read-only test-project Edge inventory/source retrieval now confirms the single
active native receipt writer's JWT gate and matches all 15 returned source and
import-map files with local audited code. No redeployment, endpoint call or
unchanged test rerun occurs. Resolved third-party dependencies, production legacy
writers and in-flight external drainage remain unverified. Build 23 stays stable.
Source comparison (historical artifact removed).

The unqueued chore/grocery read-revocation gap now has a reproduced failure and
shipping fix. HTTP 403 reads reverify the actor/household before retaining saved
presentation. Confirmed revoked membership hides household data and removes the
active offline scope; current members keep saved information. A delegated worker
handled groceries and the companion chore test while the primary agent handled
chore sync and the shared Mac verification. All 25 focused signed app-hosted
checks pass with zero failures, skips or runtime warnings. Hosted revocation,
rendered phone acceptance and CI for this source remain open. Build 23 stays
unchanged. Evidence (historical artifact removed).

Receipt-source audit `05a05085` passes
[routine CI 37669881172](https://github.com/drrius/nest/actions/runs/37669881172).

A delegated Calendar lifecycle check now passes on a fresh signed iPhone
simulator: inactive clearing removes visible local details, preserves selection,
and foreground refresh rereads changed events without another permission request.
The controlled reader isolates native model behavior; inspected scene hooks are
not counted as rendered execution. Real EventKit changes/backgrounding and both
phones remain open. Build 23 is unchanged; no release is needed for this test.
Evidence (historical artifact removed).

Household-read fix `41e1f316` passes
[routine CI 37672466304](https://github.com/drrius/nest/actions/runs/37672466304).
Its [native CI 37672466352](https://github.com/drrius/nest/actions/runs/37672466352)
also passes. The later Calendar test remains locally verified until its own CI.

The push-delivery audit now identifies its removed Expo dependency and earlier
registration state as historical. Current guidance points to SwiftUI/APNs and the
worker runbook, keeping provider acceptance separate from phone presentation and
legacy ticket/receipt polling. No runtime, credentials, scheduler or release changes.
Documentation formatting, links and whitespace checks pass.

Production now has a read-only catalog/Edge inventory, with no household, Auth
or Storage rows read and no production changes. It identifies 153 public/private
functions, zero Nest relations, eight active legacy scheduled jobs and two active
Edge writers. All nine returned Edge application files match audited legacy
source; resolved dependencies/configuration/runtime and drainage remain unverified.
Auth/Storage ownership and grants match the bounded fixture model. The observed
writers remain active; migration/stop/retirement decisions are separately gated.
The disposable comparison now matches all 148 common definitions, security
flags and execution grants. Exact parity remains false: production has four
payroll functions absent from legacy migrations plus the referenced platform
RLS event-trigger helper. Two payroll triggers bind to `payroll_payslips`.
Three focused comparison tests pass; source clarification for payroll is pending.
Owner/capability/runtime equivalence and data/drainage remain unverified.
Evidence (historical artifact removed).

Calendar/push-documentation source `2670d1c7` passes
[routine CI 37674049755](https://github.com/drrius/nest/actions/runs/37674049755).
Its [native CI 37674049688](https://github.com/drrius/nest/actions/runs/37674049688)
also passes. The focused Calendar case ran separately without skips on the Mac;
these checks do not establish rendered lifecycle or phone acceptance.

Production inventory/comparison source `9f138fcf` passes
[routine CI 37675467902](https://github.com/drrius/nest/actions/runs/37675467902).
The five-signature source difference remains a migration blocker; CI does not
turn the preserved mismatch report into catalog parity or cutover approval.

One actual EventKit foreground-refresh integration now passes on a fresh signed
simulator, with zero failures, skips or runtime warnings. A separate EventKit
store changes the synthetic event; cleared local presentation stays empty until
refresh, then shows the exact new title/location/time and preserved selection.
Only the owned calendar/preferences and simulator are removed. All four executed
source hashes match. Model lifecycle calls are direct; rendered background/scene
hooks, initial prompt, Apple sync and both-phone privacy remain open. No shipping
source or build 23 changes. Evidence (historical artifact removed).

A read-only nest-test catalog check confirms the three Auth session columns
used by push authorization match the fixture assumptions: non-null UUID ID/user
and nullable timestamptz expiry, with query-role SELECT permissions. No Auth rows
or tokens are read. This closes column-shape uncertainty only; Auth policy/runtime,
worker credentials/APNs and actual phone delivery remain open. Build 23 stays
unchanged. Evidence (historical artifact removed).

EventKit integration source `c0c0cf95` passes routine
[CI 37676884490](https://github.com/drrius/nest/actions/runs/37676884490) and native
[CI 37676884473](https://github.com/drrius/nest/actions/runs/37676884473). Native CI
reports 518 app tests, 60 guarded skips and zero failures. The actual EventKit
case ran separately on the owned Mac simulator without skips; its CI skip does
not replace that proof. Hosted session-schema source `72c930fa` passes
[routine CI 37677592966](https://github.com/drrius/nest/actions/runs/37677592966).

The agent verification skill `.agents/skills/verify-nest/` was added on 10 October and is
linked from `.claude/skills/`. It builds the working `apps/ios` tree on the Mac in a fresh
`Nest Verify <run>` simulator that it owns, and drives the app with the pinned
agent-device 0.21.15 over SSH. It then pulls evidence into the ignored
`evidence/verify-nest/<run>/`.

At the owner's request, `nest-verify accounts` created a synthetic
`Nest verification household` (`b717d595-4a32-40de-b3df-43de73757b44`). It has two
members: Test Alex (`f858a81c-06dd-41b6-a62d-ec4ba7696f92`) and Test Sam
(`786d207b-2f99-44c3-b7fc-14a9cb0c1b91`). Both use confirmed `example.invalid` password
accounts, created through the admin API. Their credentials exist only on the Mac, with
mode 600. Both accounts pass `/v1/session`, and the real household still has one member.
`nest-verify signin` runs the generalized `FictionalAccountSessionFixtureTests` on
the simulator that the run names. In a signed-in run, Test Alex added and completed a
run-prefixed chore. The hosted rows show one occurrence and one completion in the
synthetic household, and the chore stayed done after a relaunch. Money showed
`You're settled up`. Switching the run to Test Sam worked.

Signed-out sign-in, launch, doctor and cleanup were proven in earlier runs. With no
Apple Account on the simulator, closing Apple's alert shows "Sign-in could not be
verified." The Meals and Calendar recipes have not been run yet. All of this is
simulator evidence, not phone or Apple sign-in acceptance.

## Exact blockers and owner inputs

- **Backend naming, 10 October:** Supabase confirms project `tkjixmujjoustdiedfmw` is named `nest`. Vercel project `prj_yN4ZNro5utMbzmyrSC3xgPZka67G` was renamed in place to `nest-api`, retaining its project ID. The installed app's `nest-test-api-drrius-projects.vercel.app` alias still points to deployment `dpl_9MBuwADAyheonsgQTzUvSRcmUcY1`; unauthenticated Money requests returned the same expected 401 JSON before and after the rename. Local Vercel link metadata was updated. No redeployment, credentials, data or app endpoint changed.
- **Fresh-start decision, 10 October:** owner chose the existing Nest Supabase project (`tkjixmujjoustdiedfmw`) as the permanent backend, retaining real accounts and clearing only test/demo household data after identifying it. Household OS data will not be imported; its project stays untouched. Owner requested renaming `nest-test` to `Nest`. The owner renamed the project to `nest`. Fictional data cleanup is complete, preserving real accounts and household rows. Historical migration/cutover requirements below are superseded for this fresh-start path.
- **Live AI:** `openai/gpt-6-luna` with high reasoning is deployed. A real Swift read/tool stream passes. Provider tuple schemas and meal JSON validation are fixed; the final clean-dinner generation check passed without saving a plan before approval. No Gemini fallback. The owner funded Gateway with $20; setup spend was about $0.07 before the latest checks.
- **Scheduled workers:** authorized server secrets and separate Vault-backed tokens are configured. Push runs every minute; recurring processing runs hourly. Both initial live cycles and subsequent push invocations returned 200 with zero failures. No eligible notifications or financial cycles were processed in the initial runs.
- **APNs:** the owner-supplied provider key is configured server-side. Apple rejected a deliberately invalid synthetic device token as expected. Real device enrollment/delivery remains unverified. No server key is bundled in the app.
- **Phones:** build26 was archived, signed, validated and submitted once; Apple reports VALID / IN_BETA_TESTING; it is available to existing internal testers. Both-phone use, notification display and real Calendar behavior still require the owners. Leah has not appeared in Nest Auth yet and must attempt Apple sign-in before verified household linkage.
- **Delivery, 10 October:** the complete implementation is consolidated into `main` after the owner requested it. PR [#85](https://github.com/drrius/nest/pull/85) was squash-merged as `53e5dd34`; its tree exactly matched the original grocery commit. The history-only integration preserves the verified source tree. Routine CI `38041245834` and native CI `38039500471` passed; no additional review is required under the owner's waiver. Current API deployment remains `dpl_E3vL88e2rGfgaVCPnZDszXKSSCNB`, serving the existing client alias. Git integration does not publish an iPhone build or apply production migrations.
- **Fresh-start cleanup:** the synthetic-household removal script passed a full transaction rehearsal followed by rollback, preserving real household rows and trigger settings. Final deletion removed the fictional household, three synthetic Auth users and two storage objects; real data remained unchanged. Household OS migration, payroll drift and old-writer cutover do not apply to the owner's new fresh-start decision; the old project remains untouched.

- **Repository cleanup, 10 October:** removed the generated root `evidence/` directory at the owner's request and ignored future outputs there. Historical references are marked as removed; regression tests and application assets remain. Older Git commits still retain the files.

## Work order

Batch shipping fixes for one beta and verify the five current steps. Preserve prior evidence; repeat only affected checks.

The owner removed the continuation automation; it remains removed. No extra Sol
verification is required. Purchases and new tester invitations are not implied.

## History

[7 October checkpoints](progress-history-2026-10-07-checkpoints.md) preserve the former
full log, including intermediate builds, unsuccessful attempts and source-specific
counts. [7 October preparation history](progress-history-2026-10-07.md),
[5 October history](progress-history-2026-10-05.md) and
[1 October history](progress-history-2026-10-01.md) retain earlier evidence.
Historical pending statements do not override the current remaining list.
