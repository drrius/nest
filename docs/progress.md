# Nest progress

Updated 7 October 2026. The goal remains active and incomplete. SwiftUI is the
shipping iPhone client under [ADR 0002](adr/0002-swiftui-client.md). Expo and React
Native are removed. The agreed product scope, Effect backend, financial history
and privacy rules remain authoritative.

## Current build

**SwiftUI 0.1.0, build 23 is available for internal TestFlight testing.** Its frozen
source is `9ecfdca2c66c98dae0df9d906a088c56a42580dc`. Apple reports VALID,
IN_BETA_TESTING and unexpired. One private submission finished; no further upload
is needed. [Build and availability evidence](../evidence/2026-10-07/swiftui-build23/README.md).

It uses the separate test Supabase/API and keeps push disabled. It includes
build 22's shared tab layout and recovery controls plus later saved-meal,
meal-read privacy/account-context, Money history spacing and picker target fixes.
Installation of this version, partner tester access and full phone acceptance
remain unverified. Use the [short phone pass](native-rewrite/build23-first-phone-pass.md)
and [full acceptance checklist](native-rewrite/swiftui-phone-acceptance.md).

Source work runs on Linux at `/home/drrius/Work/nest`; signed Xcode builds and
simulator journeys run on the authorized Mac. The original clients, credentials,
local journals and settings are preserved. New source remains on
`codex/swiftui-renewal-navigation`; no production cutover or public release occurs.

Build 23's 1,188 frozen inputs match the Mac copy and local signed Release
archive/export/package checks pass. The copied IPA hash matches; temporary signing
material is removed on both hosts. Both exact-source CI runs pass and the single
private submission `b113adff-6504-4a4f-91e0-4d6304667f94` is FINISHED. Apple
availability is verified separately. No cloud build is used.

## Milestone checklist

Unchecked means full acceptance remains open. Implementation and bounded tests
are credited without claiming live-provider or physical-device verification.
The [remaining acceptance list](native-rewrite/remaining-work.md) links detailed
journey evidence and identifies the uncovered requirements.

- [x] **M0, decisions and native execution.** ADRs, action inventory, signed execution, source/build identity and scoped four-tab smoke pass. [Foundation audit](../evidence/2026-10-04/swiftui-m0-foundation/README.md).
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
[Probe and limits](../evidence/2026-10-07/swiftui-native-contrast-probe/README.md).
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
[Hosted checkpoint](../evidence/2026-10-07/hosted-test-scheduled-writers/README.md).
The native diagnosis source `240ed33b` passes routine
[CI 37619852843](https://github.com/drrius/nest/actions/runs/37619852843); the hosted
inventory/source-parity source `971b2069` passes
[CI 37621917353](https://github.com/drrius/nest/actions/runs/37621917353).
The rerunnable comparison source `6ef3c4b7` also passes
[CI 37623018040](https://github.com/drrius/nest/actions/runs/37623018040).
Neither check changes the retained failures or closes M1/M9 acceptance.

The new read-only scheduled-writer inventory is integrated into the disposable
migration runner and focused CI selection. Thirteen local PostgreSQL checks pass
with no failures or skips across the new inventory and existing privilege/fence
checks. They cover missing/restricted/unsupported/truncated catalogs, unknown and
inactive jobs, hashed commands/functions without exported bodies, unchanged rows
and refusal of an already writable transaction.
[Evidence](../evidence/2026-10-07/scheduled-writer-inventory/README.md).
Real pg_cron execution, hosted identity and drainage remain unverified.
This change does not require another phone build. Source `e724fe87` passes routine
[CI 37615820449](https://github.com/drrius/nest/actions/runs/37615820449).

CI now has a conservative documentation-only path. It retains
formatting, relative-document link checks and its own scope tests. Application
checks can be omitted only for docs/evidence Markdown changes whose base commit
already passed CI; unknown/failed/pending bases and all other changed files keep
the full checks. Four local Git/CLI cases and full source
[CI 37616655593](https://github.com/drrius/nest/actions/runs/37616655593) pass at
`7911bb76`. Actual documentation-only
[CI 37617123884](https://github.com/drrius/nest/actions/runs/37617123884) passes at
`245a754d` in 31 seconds with format/link/scope checks; application checks are
explicitly skipped against the already verified source. This is documentation
verification, not another native or domain test run.

Variable-bill Save/cancellation now has both commit orders verified through the
native session, real local Effect API, PostgREST/PostgreSQL and SQLite restart.
Two API and two signed native cases pass without skips. Actual database lock waits
force each order; recorded outcomes retain one expense and cancelled outcomes
retain none. Terminal replay sends no second write. Authentication/session entry
is controlled, so hosted/Apple/phone/UI-race and live-AI acceptance remain open.
[Ordered race evidence](../evidence/2026-10-07/swiftui-variable-bill-ordered-races/README.md).
Shipping runtime/configuration remains unchanged. Source `a1aa923d` passes routine
[CI 37627414604](https://github.com/drrius/nest/actions/runs/37627414604) and native
[CI 37627414734](https://github.com/drrius/nest/actions/runs/37627414734). Native CI
reports 498 app tests, 56 guarded skips and zero failures. The two ordered native
cases ran separately on the Mac without skips; CI skips do not replace them.

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
affected change or failure requires another run. [Evidence](../evidence/2026-10-07/swiftui-money-history-spacing/README.md).

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
[Evidence](../evidence/2026-10-07/swiftui-today-meals-cache/README.md).

A known forbidden meal-week read now removes that actor/household/week's local
read snapshot in Today and Meals. The baseline exposes the denied cache; four
corrected signed app cases and one SQLite restart/scope check pass without skips.
Uncertain operations and partner snapshots remain intact. Concurrent old replies,
hosted revocation and phone behavior remain unverified. Current-source CI is
pending for later source. The sequential-denial source `bb3d93a5` is pushed and
passes [routine CI 37637534983](https://github.com/drrius/nest/actions/runs/37637534983).
[Native CI 37637535002](https://github.com/drrius/nest/actions/runs/37637535002)
also passes, with 504 app tests, 57 guarded skips and zero failures.
[Evidence](../evidence/2026-10-07/swiftui-meal-cache-denial/README.md).

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
[Evidence](../evidence/2026-10-07/swiftui-meal-read-denial-races/README.md).

Planned recipe and preparation read copies now share the scoped week fence.
Known denial removes the copies and selected detail; old replies cannot restore
them, while pending commands remain intact. Both baseline regressions fail as
expected. Fourteen corrected signed app cases and fourteen SQLite cases pass
without skips, including normal offline/absence behavior and recovery. Hosted,
rendered-phone and other read-only-path acceptance remain open. Current-source CI
is pending for later source. Detail source `91c06917` passes
[routine CI 37641010696](https://github.com/drrius/nest/actions/runs/37641010696);
[native CI 37641010744](https://github.com/drrius/nest/actions/runs/37641010744)
also passes, with 508 app tests, 57 guarded skips and zero failures. [Evidence](../evidence/2026-10-07/swiftui-meal-detail-denial/README.md).

All remaining shipping week reads now use the shared fenced command, including
proposal preview, ingredient refresh and mutation preflight. Ingredient read
updates validate the same ticket atomically with the saved-choice sequence;
exclusions and pending additions remain intact. A held proposal reply fails
before the fix. Thirty-two corrected signed app cases and nine SQLite cases pass
without skips, including existing approval/retry/offline behavior. Hosted, live-AI
and phone acceptance remain open. Current-source CI is pending.
[Evidence](../evidence/2026-10-07/swiftui-meal-read-callers/README.md).

Audited writer owner attributes are now measured from nest-test catalog metadata.
Its postgres owner is non-superuser with BYPASSRLS; the fresh disposable fixture
bootstrap is superuser with BYPASSRLS. Other measured role flags match. This
confirms a real privilege-fidelity gap instead of assuming equivalent owners;
effective table/function grants, private dependencies and production remain open.
No roles, data or schedules change. The small fixture is stopped and the completed
311-migration rehearsal is not repeated.
[Evidence](../evidence/2026-10-07/migration-owner-roles/README.md).

The disposable migration rehearsal now uses a distinct owner, lowered from
superuser before runtime checks. All 311 migrations apply and both financial
reconciliations pass under the revised runner. Seven focused fixture/runtime/
lifecycle tests pass without failures or skips. Measured role flags match nest-test;
Auth/Storage grants and API-role membership remain simulated, so full hosted
permission equivalence and production readiness remain open. The earlier public
schema permission failure is retained. This closes a local rehearsal gap without
another native build. [Evidence](../evidence/2026-10-07/migration-runtime-owner/README.md).

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
initial permission prompts, live sharing and both phones remain open. [Evidence](../evidence/2026-10-07/swiftui-eventkit-revocation/README.md).

The failed ingredient account-switch contract now rechecks caller context when
the shared week read throws. The exact failed method and affected library,
ingredient and denial-race cases pass in 21 signed app tests, without failures or
skips. The original CI failure remains recorded; current-head CI is pending for
this correction. No test expectation is relaxed, hosted data is untouched and
build 22 stays unchanged. [Evidence](../evidence/2026-10-07/swiftui-ingredient-context-ci/README.md).

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
unchanged. [Evidence](../evidence/2026-10-07/swiftui-correction-refund/README.md).

The second fictional member now reads the four exact correction/refund-chain
entries through native Financial history and the hosted test API. The read-only
signed case passes without failures, skips or runtime warnings. The full financial
snapshot is unchanged after reading. Original Sam scope and all 64 command
journals match; its owned clone is deleted. The earlier standalone keyboard
warning diagnosis already reproduces the writer's warning message on this runtime;
current writer stack identity is unavailable, so phone/runtime acceptance stays
open. No new probe or financial posting is used for that diagnosis.
[Evidence](../evidence/2026-10-07/swiftui-correction-refund/README.md).

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
[Evidence](../evidence/2026-10-07/swiftui-recurring-lifecycle/README.md).

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
[Evidence](../evidence/2026-10-07/swiftui-recurring-edit-resume/README.md).

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
[Evidence](../evidence/2026-10-07/migration-managed-ownership/README.md).

Managed-ownership source `e0e037b1` passes
[routine CI 37667651167](https://github.com/drrius/nest/actions/runs/37667651167).
A read-only test-project Edge inventory/source retrieval now confirms the single
active native receipt writer's JWT gate and matches all 15 returned source and
import-map files with local audited code. No redeployment, endpoint call or
unchanged test rerun occurs. Resolved third-party dependencies, production legacy
writers and in-flight external drainage remain unverified. Build 23 stays stable.
[Source comparison](../evidence/2026-10-07/deployed-native-receipt-source/README.md).

The unqueued chore/grocery read-revocation gap now has a reproduced failure and
shipping fix. HTTP 403 reads reverify the actor/household before retaining saved
presentation. Confirmed revoked membership hides household data and removes the
active offline scope; current members keep saved information. A delegated worker
handled groceries and the companion chore test while the primary agent handled
chore sync and the shared Mac verification. All 25 focused signed app-hosted
checks pass with zero failures, skips or runtime warnings. Hosted revocation,
rendered phone acceptance and CI for this source remain open. Build 23 stays
unchanged. [Evidence](../evidence/2026-10-07/swiftui-household-read-revocation/README.md).

Receipt-source audit `05a05085` passes
[routine CI 37669881172](https://github.com/drrius/nest/actions/runs/37669881172).

A delegated Calendar lifecycle check now passes on a fresh signed iPhone
simulator: inactive clearing removes visible local details, preserves selection,
and foreground refresh rereads changed events without another permission request.
The controlled reader isolates native model behavior; inspected scene hooks are
not counted as rendered execution. Real EventKit changes/backgrounding and both
phones remain open. Build 23 is unchanged; no release is needed for this test.
[Evidence](../evidence/2026-10-07/swiftui-calendar-foreground/README.md).

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
[Evidence](../evidence/2026-10-07/production-catalog-inventory/README.md).

Calendar/push-documentation source `2670d1c7` passes
[routine CI 37674049755](https://github.com/drrius/nest/actions/runs/37674049755).
Its [native CI 37674049688](https://github.com/drrius/nest/actions/runs/37674049688)
also passes. The focused Calendar case ran separately without skips on the Mac;
these checks do not establish rendered lifecycle or phone acceptance.

## Exact blockers and owner inputs

- **Live AI:** the last provider result was `customer_verification_required` with zero credits; this is historical, not current eligibility. Automatic approval review blocked generating a short-lived `nest-test-api` OIDC token for a read-only credits check. The specific approval question remains pending. No token, model call, purchase or billing change followed.
- **Scheduled workers:** automatic approval review blocked transferring the test Supabase server key and scheduler token to Vercel. The specific transfer approval remains pending; no alternate transfer or worker activation occurred.
- **APNs:** server-side provider `.p8`, key ID, team/configuration and physical token/delivery verification are missing. App Store signing credentials do not supply that provider key. Push stays disabled.
- **Phones:** both partners need build 23 installation and acceptance of ordinary daily, weekly, financial and Calendar tasks. VoiceOver, Reduce Motion, real radio interruptions and push require hardware evidence. Partner tester access remains unverified; existing feedback requests should not be duplicated.
- **Branch delivery resolved:** a non-force complete-pack push delivered `aa4df4ee` after three normal pushes returned GitHub Internal Server Error. The exact remote branch is verified. Routine [CI 37642938829](https://github.com/drrius/nest/actions/runs/37642938829) passes; native [CI 37642938666](https://github.com/drrius/nest/actions/runs/37642938666) later ended cancelled with the account-switch failure recorded above. No force push, main update or history rewrite occurred. The cause of the remote errors is not proven.
- **Merge:** [PR 85](https://github.com/drrius/nest/pull/85) is OPEN at `1c00a089`, with four successful checks. Its sole Greptile response reports the trial credit limit and supplies no approval. The specific automatic-review merge rejection remains unresolved. The owner waived extra Sol review; no Sol, duplicate unchanged review request or alternate main push is used.
- **Production source difference:** four payroll functions and `payroll_payslips` trigger bindings are absent from the audited legacy migrations. The source/location question is pending. Preserve these objects; exact catalog parity and cutover readiness remain false. The platform auto-RLS hook is also absent from the disposable bootstrap.
- **Production:** read-only catalog/Edge identity is now recorded. Existing-data reconciliation, writer decisions and pending-intent/external-work drainage must still precede cutover. Production migration, retirement and public release remain separately gated. Fixture success is not authorization.

## Work order

Keep build 23 stable for phone testing. Batch necessary shipping fixes, preserve
completed evidence and repeat checks only for affected changes, failures or uncovered
requirements. Finish concrete local gaps while provider/worker/device blockers
remain. Reconcile all milestone exits before declaring completion.

The owner removed the continuation automation; it remains removed. No extra Sol
verification is required. Purchases and new tester invitations are not implied.

## History

[7 October checkpoints](progress-history-2026-10-07-checkpoints.md) preserve the former
full log, including intermediate builds, unsuccessful attempts and source-specific
counts. [7 October preparation history](progress-history-2026-10-07.md),
[5 October history](progress-history-2026-10-05.md) and
[1 October history](progress-history-2026-10-01.md) retain earlier evidence.
Historical pending statements do not override the current remaining list.
