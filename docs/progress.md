# Nest progress

Updated 5 October 2026. **The goal is active and incomplete. M0’s native-execution foundation gate is verified; M1–M9 acceptance gates remain open.** [ADR0002](adr/0002-swiftui-client.md) makes SwiftUI authoritative; Expo/RN client code and dependencies are removed. The Effect v4/Vercel AI SDK backend, financial/privacy rules and approved Quiet design remain in force.

Source work is on Linux, `/home/drrius/Work/nest`; owned Xcode/simulator work uses the isolated `/private/tmp/nest-current-qa-82a` mirror on the Mac; the original `/Users/dariussibarium/Developer/nest-swiftui` mirror is preserved. Native CI is separate from that owned simulator. The full prior log is preserved in [dated evidence](progress-history-2026-10-01.md); its old build numbers and pending states are historical.

## Available candidate and current source

**Latest private candidate: SwiftUI0.1.0/build16**, source `5a228bef`. Exact-source routine/native CI, the signed native archive/export and Apple VALID/IN_BETA_TESTING/unexpired checks pass. [Release evidence](../evidence/2026-10-04/swiftui-build16/README.md). Next owner action: update Nest in TestFlight and try the [short phone pass](native-rewrite/build16-first-phone-pass.md). Partner access, installation and phone/design acceptance are unverified. AI, scheduled posting/reminders and push remain inactive; production is untouched. Older candidate statements below are historical.

Detailed earlier slice checkpoints, including previous candidate numbers, remain in [the 4 October history](progress-history-2026-10-04.md). Later evidence below supersedes their pending states.

## Milestone checklist

Unchecked means complete acceptance is outstanding, even where implementation and bounded verification exist.

- [x] **M0 — Decisions and native execution.** Approved ADRs/action inventory, source/build/environment identity, repeatable signed local Xcode/native CI execution and internally available build16 installation path are verified. Current source-matched clean signed-out cold launch and real scoped-session four-tab smoke pass. [Criterion-by-criterion audit](../evidence/2026-10-04/swiftui-m0-foundation/README.md). The plan explicitly separates physical permission/calendar/push acceptance; both-phone installation/sign-in remain M3/M6/M8/M9 gates. Full M1–M9 acceptance stays open.
- [ ] **M1 — Quiet native interactions.** Four SwiftUI tabs and real-data surfaces exist, with selected rendered and large-text simulator evidence. The [artwork inventory](native-rewrite/artwork-inventory.md) now audits the single generated-icon source, native symbols and build13 packaging. Full populated/error/keyboard/VoiceOver/Reduce Motion review and owner design acceptance remain.
- [ ] **M2 — Authenticated offline/AI slice.** Keychain, verified sessions, scoped SQLite and limited exact replay are implemented and tested. Private chat, streaming/interruption/cancellation and honest handoffs exist. Live AI still fails Gateway eligibility403; successful live tool/stream behavior and both-member phone/offline acceptance remain.
- [ ] **M3 — Identity, onboarding and settings.** Quick/comprehensive setup, progressive entry, food/cooking/notification preferences and private-memory consent/recovery exist. New online preflight, canonical settings-result links and account/read fences pass CI. Normal-text owned native saves/lost-reply recovery/stale-form refusal and hosted populated-goal privacy now pass; both-member forms, broader setup/private settings, accessibility and hardware enrollment remain.
- [ ] **M4 — Today, chores and groceries.** Today filters, ordinary/alternating chore commands, handovers, grocery CRUD/checking, exact scoped SQLite retry/conflicts and corresponding AI commands exist. Source/native/property/RLS checks and selected hosted/owned flows pass. Current grocery edit preflight, retained fields, explicit latest-item reload, committed lost-response restart/update/exact retry, precise removed-intent copy/discard and normal/large-text touch targets now pass owned test-API execution with normal cleanup and unchanged money. Earlier checkbox compatibility/opposing-intent cases and grocery→expense switch/back also pass. Both required grocery-source CI workflows pass. Two-native-client/phone chores/handovers, broader settings/navigation, VoiceOver/haptics/radio loss and complete daily-use acceptance remain open; full M4 is not closed.
- [ ] **M5 — Meals and planning.** Week/library/recipe CRUD, saved/one-off placement, move/replacement/removal, proposals, ingredients and preparation exist. A manual seven-day saved-recipe cycle, preparation and replacement have bounded real native/two-member evidence with normal cleanup. Varied portions/partner constraints, live generation/replacement and full phone/UI acceptance remain.
- [ ] **M6 — Read-only Calendar.** EventKit, permission/selection, agenda/layers and explicit numeric-only busy sharing exist. Selected real timed/all-day/DST, both-member sharing, outsider denial and online cleanup pass; durable offline removal and races have focused tests. Hardware offline/reconnection, long background periods, complex calendars and full accessibility/privacy journeys remain. Personal event text stays on-device.
- [ ] **M7 — Money.** Native balance/history/detail, financial commands/private approvals, receipt storage, recurring controls/variable bills and exact recovery exist over append-only CHF-centime history. Selected arithmetic/isolation/lost-response/hosted checks pass. Pause/cancel proposal review and exact recovery pass focused native CI; resumption proposal review/recovery passes current-source native CI; variable-cycle proposal review/decision/recovery is implemented with local wire/database checks and exact-source Foundation/native/routine CI passing; manual-cycle selection/review/command recovery passes local checks and exact-source Foundation/native/routine CI; private manual-cycle approvals and retained legacy inventory/draft history pass exact-source native/routine CI. Direct legacy dismissal passes local checks and exact-source native/routine CI; its original-term review/navigation/alert cancellation now pass owned rendering. Private dismissal approval/withdrawal passes local and exact-source native/routine CI; original-term review/navigation/alert cancellation now pass owned rendering. Actual rendered recovery states and full phone journeys remain pending. Direct draft-to-expense confirmation now has native source and focused Mac/database verification; both required workflows and actual fictional keyboard/review/cancel rendering pass at direct-confirmation source `4759e124`. Private confirmation review/recovery now has native source with focused Mac/backend and actual fictional alert verification; both focused native offline discovery/isolation checks pass; exact-source CI passes at `886773cc` (463 Foundation/41 explicit skips and344 signed-native/nine explicit skips, zero failures). Direct rule adoption source `e3e6b1ef` now has explicit fresh terms, prospective coverage/member/day preflight and exact recovery; focused Mac/backend and actual fictional variable-form checks pass. Nest37142967731 passes and SwiftUI37142967820 also passes:468 Foundation/41 explicit skips and357 signed-native/10 explicit skips, zero failures, strict formatting/source limits and actual signing. Private adoption now has source and focused Mac/backend/fictional-form verification; native CI at `1151caad` and corrected routine CI at `83a5a015` pass; hosted/provider/phone acceptance and recovery rendering remain pending. [Source coverage](native-rewrite/action-inventory.md#swiftui-financial-approval-coverage-1-october-2026) records the exact gaps. Ordinary expense/settlement and refund/correction staging now require fresh scoped domain reads before new intent; both slices pass exact-source Foundation/native and routine CI. Recurring create/edit/state/resume/variable staging now has fresh membership/revision/server-day/uncovered-cycle checks,23 focused local integration cases passing and exact-source Foundation/native/routine CI passing. Expense/refund/correction/settlement/rule approval staging now has fresh exact private pending/unexpired reads, with all six new native cases and ten existing exact-recovery cases passing current-source CI; existing account checks and later online retries do not prove that offline initiation is blocked. All approval/recurring variants, full history reconciliation and native/two-phone acceptance remain. Production posting is inactive.
- [ ] **M8 — Renewals, reminders and push.** Renewal CRUD, recipient reminder editors, saved summaries, direct APNs transport, registration/outcomes, bounded worker and protected routes exist with fixture/native/selected hosted evidence. Wider linked/pagination/conflict cases, populated summaries, provider credentials, worker activation, real hardware enrollment and all six delivery kinds on both phones remain. Push is disabled in the current build16.
- [ ] **M9 — Migration and release rehearsal.** Safe synthetic reconciliation/recovery exists; the latest54-legacy/251-native fixture passes with explicit infrastructure exclusions. Local signed binary/internal TestFlight packaging passes. Hosted current-chain reconciliation, external-writer/old-intent drainage, final release source and both-member usability remain. Production cutover, old-app retirement, purchases and public release are separately gated.

## Latest native receipt recovery

The actual native Photos picker now uploads an audited synthetic fixture to private nest-test Storage. Its exact1,476 normalized JPEG bytes/hash match independent uploader reads; partner, outsider and anonymous requests are denied while unposted. The same native reservation/bytes survive restart and a signed client update. One native Remove deletes only this object, with a deliberately lost reply retaining the scoped cleanup intent; reopening emits no write. Two explicit largest-text corner retries return the same deletion result, one also losing its reply, then normally clear the slot. A misleading smaller-photo error is corrected to removal-specific guidance. Nine focused Foundation/three signed native tests pass with no failures/skips, strict formatting/source limits and1,039-input matching. Both full52-event histories/balances and the existing claimed receipt remain intact; pending inventories are restored. Ordinary Today/stable signed test origins, empty31+7+receipt slots, preserved data/Keychain and owned relay/key teardown pass. [Evidence](../evidence/2026-10-04/swiftui-native-receipt-recovery/README.md). Exact source `a0458304` now passes Nest37195153704/SwiftUI37195153685:490 Foundation cases/41 explicit skips and409 signed-native cases/11 explicit skips, zero failures, strict format/limits and actual signing. The existing claimed receipt also renders through native history/detail/browser navigation and returns to the same entry; both complete histories/Storage remain unchanged. [Viewer evidence](../evidence/2026-10-04/swiftui-claimed-receipt-viewer/README.md) records corrected offscreen/close-icon observer assumptions without repeated opens or signed-URL exports. PDF picking, new posted attachment, partner native viewer, full accessibility, live AI handoff and both phones remain open. No expense, beta, production action or merge occurred; M7 remains incomplete.

## Recent verification

Counts below include the explicitly stated skips; skipped hosted/presentation tests are not acceptance. Current approved-preflight source `56ce10da` passes415 Core/41 skips and265 native/six skips; its routine CI and docs checkpoint27efd0ea/Nest36849644141 pass. Ordinary expense/settlement entry preflight has13 local real-database/HTTP cases passing and exact-source native CI passing. Resumption display source `a0b6d8fc` passes both workflows and all twelve new cases. Prior pause/cancel source remains separately verified. Sixteen local wire/API/real database/SDK cases and four manifest gates pass. The54-legacy/248-native current-chain fixture passes with retained reconciliation/recovery, synthetic Auth/Storage and no new security-advisor execution. [Complete slice evidence](../evidence/2026-10-01/swiftui-recurring-state-approval/README.md).

| Slice/source                                                                                                                                                                                 | Completed verification                                                                                                                                                                                     | Still unverified                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [Saved-recipe replacement](../evidence/2026-10-01/swiftui-saved-recipe-replacement/README.md), `11f071f5`                                                                                    | Both CI workflows; four new Core/five native cases; actual owned replacement, two-member retained snapshots, outsider denials and exact cleanup                                                            | Live AI, phones, full accessibility                                                                              |
| [Ordinary meal result links](../evidence/2026-10-01/swiftui-assistant-meal-links/README.md), `d5c04300`                                                                                      | Both CI workflows; three new Core/five existing destination cases, strict Effect and nine isolated HTTP/SDK/database cases; controlled actual corner taps/back reload                                      | Hosted transcript/live provider, phones; final969-input comparison and current-source owned corner taps now pass |
| [Grocery links](../evidence/2026-10-01/swiftui-assistant-grocery-links/README.md), `0c4fc1a9`; [routine links](../evidence/2026-10-01/swiftui-assistant-routine-links/README.md), `663c3aca` | Exact-source CI; three Core/four native cases per slice; strict Effect and real isolated HTTP/SDK/PostgreSQL checks                                                                                        | Owned rendered links/child navigation, live provider, phones                                                     |
| [Chore links](../evidence/2026-10-01/swiftui-assistant-chore-links/README.md), `d3d6918a`                                                                                                    | Nest36830276806/SwiftUI36830276771;400 Core/41 skips and240 native/six skips, zero failures. Three new Core/two native cases, strict Effect and five isolated integration cases                            | Rendered navigation, live provider, phones                                                                       |
| [Preference preflight](../evidence/2026-10-01/swiftui-preference-preflight/README.md), `ce15b3e2`                                                                                            | Nest36831957709/SwiftUI36831957708;400 Core/41 skips and243 native/six skips, zero failures. Three new cases across food/cooking, five exact-retry/conflict/race cases and one real database conflict case | Rendered reload confirmation/draft preservation, phones                                                          |
| [Assistant settings results](../evidence/2026-10-01/swiftui-assistant-preference-links/README.md), `1572bc01`                                                                                | Nest36833050093/SwiftUI36833050009;404 Core/41 skips and245 native/six skips, zero failures. Four new parser/two destination-read cases; actual Effect fixture and15 isolated real HTTP/AI/database cases  | Rendered links/back navigation, live provider, phones                                                            |
| [Rejected-result fallback](../evidence/2026-10-01/swiftui-assistant-result-fallback/README.md), `d28a7423`                                                                                   | Nest36833495327/SwiftUI36833495278 pass;404 Core/41 skips and245 native/six skips, zero failures. Three rewritten canonical/failure regression cases pass with zero failures/skips                         | Owned rendered history, live provider, phones                                                                    |

Required completed native runs also pass strict Swift formatting, source limits and actual app signing. Initial chore/preflight/settings runs stopped on formatting findings and were corrected before passing execution. The handover disposable integration fixture initially lacked the current epoch RPC; existing epoch migrations plus an exact epoch assertion fixed it without changing application/RLS/production migrations. A sandbox child test did not establish real execution; the authorized isolated test runs do. Logs and boundaries remain in the evidence/archive.

Backend worker source `01467d62` passes isolated routine/deep checks:13 core,50 conflict,1,223 database/RLS cases, zero failures/skips. Its disabled preview has no alias, schedules or jobs. Live activation is not verified. Controlled/injected transport, compilation, signing and SDK execution do not prove live model calls, actual taps or phone delivery.

## Exact blockers and owner inputs

- **Native QA:** current grocery rendering/recovery and final stable-origin restoration are verified on the owned simulator; no active fault relay, generated private key, test groceries or unresolved grocery/expense intent remains from this pass. Both exact-source CI workflows pass; no CI result remains pending for this bounded grocery source. Ordinary expense interrupted-save/cancellation and keyboard checks also pass; Full history pagination now passes the later owned-native/hosted check above; approvals/recurring, meal/chore/settings journeys, full accessibility and both phones remain open. Future Mac availability must be inspected when the next owned run begins; the temporary one-hour awake process has finished.

- **AI eligibility:** the last real Swift/provider and bounded synthetic checks returned Gateway403 requiring valid-card eligibility; credits/usage0/0. Existing project-only USD1 nonrefreshing cap remains unchanged. Eligibility must change before a bounded recheck. Do not buy credits or change the approved CHF20/month ceiling without approval.
- **Legacy completion boundary:** a direct legacy RPC could write a future completion date. New commands now reject future/nonfinite/unsupported dates while preserving historical exact replies. Seven focused database tests and the304-migration rehearsal pass, including21 document/profile/completion-photo/date probes and existing real database AI/epoch dispatch. Manifest55/250 and all four manifest tests pass. Applied only to nest-test (hosted20261004144314): exact body/ACLs, ten real Auth/PostgREST negative probes and unchanged complete finance/attachments/routine history pass. Routine37210225147 and Deep37210426388 pass exact source c5469baf (23 core,50 conflicts,1,235 database/RLS, zero failures/skips). No new native execution claimed;49 other legacy public functions/deeper private paths remain. [Evidence](../evidence/2026-10-04/legacy-completion-date-boundaries/README.md). Prior receipt cleanup checkpoint1d67f235 now passes Nest37208513631. M9 stays open.
- **Receipt cleanup:** two retained legacy cleanup RPCs could invalidate another member's old private native receipt intent. The uploader guard now passes17 focused database tests and the303-migration disposable rehearsal, with16 new attachment boundary probes and exact retained finance/receipt reconciliation. Applied only to `nest-test`: hosted bodies/ACLs match, all52 financial events plus allocation/ledger/upload/intent/Storage digests stay unchanged. Source956cd927 routine CI37207407493 caught the omitted migration checksum entry; it is corrected and four local manifest tests pass. Corrected source3b141cc5 passes routine CI37207727428; deep37207534599 passes unchanged SQL/tests with23 core,50 conflicts and1,231 database/RLS cases, zero failures/skips. [Evidence](../evidence/2026-10-04/legacy-receipt-cleanup/README.md). Existing81 privileged-function warnings remain; ten legacy public RPCs now have bounded reviews, with50 others/deeper private paths open. M9 stays open.
- **Test API:** preview `nest-test-kjn4mw4di-drrius-projects.vercel.app`, backend source `83a5a015`, is READY and now serves the already-authorized stable test API alias. Seventeen read-only checks pass on the preview and again on the stable address: both members see the expected test household, an outsider gets403, anonymous money access gets401 and the recurring worker returns404 while disabled. Existing preview configuration was reused; no server secret was transferred, scheduler activated, financial write/model call sent or production data touched. Hosted populated legacy/approval/provider journeys remain unverified.

- **Worker credential transfer:** automatic approval review rejected exporting the test Supabase server key and scheduler token to Vercel because prior test-deployment authorization did not explicitly cover that transfer. A specific owner approval question is already pending. No transfer, alternate path, schedules or worker activation occurred.
- **APNs:** server-side provider `.p8`, key ID/team/configuration, worker activation and real hardware token/enrollment/six-kind delivery on both phones remain needed. App Store Connect signing credentials are not an APNs provider key. Push stays disabled.
- **Phones:** both partners need the identified build16 installation, Apple sign-in and [phone checklist](native-rewrite/swiftui-phone-acceptance.md), followed by complete weekly/financial-approval/offline-conflict/calendar/privacy/accessibility acceptance. Actual partner tester access is still unverified. Pending phone-feedback questions should not be duplicated.
- **Merge:** [PR85](https://github.com/drrius/nest/pull/85) was freshly read on3 October as OPEN/CLEAN and retains the specific recorded automatic-review exception. The Sol waiver does not erase it; no local/main merge bypass. New source is pushed on feature branches with CI.
- **Cutover:** existing-data/current-chain reconciliation and external-writer/old-intent drainage precede any production migration, retirement or public release. Safe fixtures and private testing do not authorize these actions.

## Latest handover completion check

Incoming final-sheet acceptance and outgoing request/lost-reply/restart recovery now pass owned native checks against two fictional separate-test routines. Partner acceptance before exact sender replay preserves responsibility; sender/outsider403 and anonymous401 pass. Both full financial histories and balances remain unchanged. A rendered stale pending-status claim was fixed without changing the immutable receipt or retry command; the corrected signed app preserves the saved result, works at ordinary/largest text and explicitly finishes to a fresh no-pending snapshot. Three focused real PostgreSQL/PostgREST integration tests pass; strict Swift formatting/source limits and actual signing pass. Both fixtures are normally archived, stable test origins/ordinary Today restored, journals empty, data/Keychain preserved and relay stopped/generated key destroyed. [Evidence](../evidence/2026-10-04/swiftui-chore-handover-completion/README.md). Exact-source Nest37169218381/SwiftUI37169218366 now pass at `32897294`:484 Foundation/41 explicit skips and396 signed-native/11 explicit skips, zero failures, strict format/limits and signing. This is newer than build15; both-phone/VoiceOver/full alternating/membership-change acceptance and every full milestone gate remain open.

## Current-chain migration and pending job rehearsal

All54 legacy and248 current Nest migrations now pass a fresh disposable populated rehearsal with exact retained financial/receipt/domain reconciliation. New real-function rollback-only probes reproduce due reminder/draft/unclaimed outbox processing and preserve a live claim; pausing those three entry points preserves all pending rows, attempt/lease fields, rule cursor and claims. Eight existing pause guards and committed recovery of24 new financial events also pass. [Evidence](../evidence/2026-10-04/current-chain-pending-job-rehearsal/README.md). Auth/Storage interfaces remain simulated, pg_net is explicitly excluded, security advisors were not configured and live scheduler/Edge-request/old-client drainage remains unverified. No test-host or production access occurred. The [cutover review plan](native-rewrite/cutover-review-package.md) now identifies the evidence packet, controlled transition and history-preserving recovery rules; it has no production activation entry point. Exact-source routine CI37169476872 now passes at `0c08d0cc`; full M9 remains open.

## Hosted test security inventory

A fresh read-only nest-test audit now verifies no public table lacks RLS, no accessible anonymous security-definer execution, no public views, private-schema REST406 rejection and all70 public/private definitions of the35 actual worker RPC names denying client execution. Database cron jobs are empty; one JWT-verified receipt Edge function and55 platform migration entries are inventoried without claiming runtime execution or302-file equality. The61 no-policy tables retain deny-all RLS and no client SELECT/authenticated write grants. Advisor warnings remain for81 authenticated public privileged functions (21 Nest/60 legacy, fixed search paths) and paid leaked-password protection. Ten private internal tables lack RLS but have no client table privileges;140 authenticated private definers still need reachable-helper semantic review. Public Auth settings confirm Apple/email enabled, anonymous/phone/SAML disabled, email confirmation required and signup enabled. Provider/signup choices and partner Apple linking remain open. [Evidence](../evidence/2026-10-04/test-environment-security-inventory/README.md) records exact queries/configuration and remediation links. No schema/configuration change, worker activation, server-secret transfer, inference or production access occurred. Routine CI37187956449 also passes the preceding docs checkpoint `b0964369`; full M9 remains incomplete.

The21 Nest public privileged findings now have a bounded [actual guard trace](../evidence/2026-10-04/test-environment-security-inventory/native-guard-review.md). All34 inspected entry/direct-helper bodies match a fresh compiled302-migration disposable schema, including moves/renames and later conflict-code rewrites; a regex-only comparison was explicitly rejected as parity/drift proof. Forty-one focused actual PostgreSQL tests pass without failures/skips, and25 live read-only RPC probes pass for both fixtures, outsider, anonymous and unjoined-household access. No host mutation/worker/model call occurred; native Keychain sessions were preserved when expired verifier tokens were renewed. Broader private and60 legacy public semantic review, signup/provider decisions, real Auth/Storage runtime, external writers and full M9 remain open. Routine CI37189097050 passes inventory source `6c676e46`; this does not establish native or release acceptance.

## Saved meal offline viewing

Saved library and visited recipe details now have scoped, revision-bound durable SQLite snapshots with explicit recording-time notices. Six real SQLite tests and28 distinct signed-native methods pass across focused runs, with strict formatting/source limits and actual signing. Saved data cannot provide fresh AI-result proof or new offline edit authority. Forbidden recipe access still reverifies membership; confirmed removal now purges household read snapshots before deactivating the lease, with a regression covering the retained financial cache. Actual fictional hosted/native reads, process restart under controlled503, and corrected largest-text/dark notice/title layout under connection refusal pass. Both members' complete library/detail and financial history agree unchanged; outsider403/anonymous401 pass. Stable test origins/ordinary Today and preserved data/Keychain are restored, journals empty, owned relay stopped/generated key destroyed. [Evidence](../evidence/2026-10-04/swiftui-saved-meal-offline-reads/README.md). Exact-source Nest37171040819/SwiftUI37171040776 pass at `42813595`:490 Foundation/41 explicit skips and403 signed-native/11 explicit skips, zero failures, strict formatting/source limits and actual signing. Real radio loss, VoiceOver, full visited-page rendering and both-phone/full meal acceptance remain open. This source is newer than TestFlight15.

## Retained financial empty state

At source `42813595`, both regular test members see the same real empty retained inventory, outsider403/anonymous401 and unchanged complete51-event financial histories/balances. Actual stable-origin native navigation and readable ordinary/maximum-text empty states pass; the first largest-text observer stopped after one scroll, and inspection/resumption with a bounded budget corrected that observation without changing the app. Ordinary Today/text/light and empty journals are restored with data/Keychain preserved. [Evidence](../evidence/2026-10-04/swiftui-retained-empty-state/README.md). This test household has zero retained rules/drafts, so populated retained confirmation/adoption/dismissal, paging and uncertain recovery still need safe representative fixtures. No financial write, beta, production access or merge occurred. PR85 was freshly read4 October as OPEN/CLEAN on `codex/swiftui-groceries`, head `1c00a089`; its recorded automatic-review exception remains, and this feature branch is separate.

## Retained confirmation recovery

The fictional separate-test fixture now has one inactive legacy rule, one posted retained confirmation draft linked to its single new append-only entry, and one dismissed retained draft whose original terms remain. Both retained drafts are resolved. The legacy rule has now been explicitly adopted under new prospective terms; its separate native rule is paused with first bill2030-01-07. Its prior zero-inventory acceptance is historical. Never reseed or delete posted financial history. Bounded direct confirmation/dismissal/adoption now have real native/hosted recovery evidence. Private approval families still need populated native/hosted acceptance; all families still need phones. M0 is verified; M1–M9 acceptance gates stay open.

## Native preferences read and cancellation check

The real separate-test API and signed native app now pass private food/shared cooking/setup reads, invalid calorie-goal Save refusal, and deliberate Back/reopening of unsaved food/cooking edits. Both fictional members’ canonical preferences/setup and complete52-event finance remain unchanged; outsider403/anonymous401 pass. Two36pt Save controls are corrected and now measure at least44pt at normal and maximum text/dark. All1,037 source hashes, actual signing, strict Swift format/limits and routine local checks pass; both required workflows now pass at `cd32d826`: Nest37180607678 and SwiftUI37180607659,490 Foundation/41 explicit skips and403 signed-native/11 explicit skips, zero failures. Four hosted actor-override probes return only the caller’s own food/setup envelope. Direct hosted RLS proves the existing A food profile is visible to A and hidden from B/outsider; B’s absent profile remains an explicit fixture limitation. Stable test origins/ordinary Today are restored with31 empty scoped slots, preserved data/Keychain and owned relay/key cleanup. [Evidence](../evidence/2026-10-04/swiftui-preferences-review/README.md). This read-only checkpoint proves reads/validation/cancellation and control size. The later save/recovery/stale-form check below closes those bounded normal-text journeys; full large-text/VoiceOver forms, both phones and M3 acceptance remain open. No new beta or production mutation occurred.

## Native preference saves and recovery

Actual signed native/test-API food and cooking saves now pass44pt corner taps with keyboards, committed-reply loss/restart/exact operation retry, unchanged receipt/revision reconciliation and normal restoration of original values. A partner cooking update makes the open native form stale: Save refuses before staging/POST, preserves typed notes and explicit confirmed reload shows canonical partner values. Four distinct native commands/two exact replays plus one authorized partner update produce exactly food3→5/cooking3→6. Populated private-goal RLS returns the goal only to its owner. Both setup states and complete52-event financial reads/balances stay unchanged. Stable origins/ordinary Today,31 empty scoped slots, preserved data/Keychain and owned relay/key cleanup are verified. [Evidence](../evidence/2026-10-04/swiftui-preferences-save-recovery/README.md) records the keyboard-occluded observer correction and scope limits. Shipping code is unchanged from both-CI-green `cd32d826`; checkpoint `8a35603e` also passes routine CI37181034051. Maximum-text recovery, VoiceOver, populated B forms, broader onboarding/private settings, live AI and both phones still prevent full M3 acceptance. No new beta, merge or production mutation occurred.

## Current saved-meal library read

Authoritative separate-test reads show one active recipe at library revision34, rather than the51 assumed by an unfinished QA helper. The existing signed native app now opens that real library/detail, renders servings/ingredients/instructions, persists canonical actor/household-scoped snapshots and returns through Back to ordinary Today with31 empty command/decision slots. Both complete52-event histories and103/−103-centime balances remain unchanged; outsider403/anonymous401 pass. Installed stable test origins and signature are verified, with data/Keychain preserved. [Evidence](../evidence/2026-10-04/swiftui-current-library-reads/README.md) records the failed fixture assumption and explicitly excludes multiple-page native execution. No new binary/full suite, beta, merge or production write occurred. Previous checkpoint `c5f01e57` passes routine CI37182969224; shipping native source is unchanged from both-CI-green `cd32d826`. Full meal planning/accessibility/phone acceptance and M5 remain open.

## Native manual week and meal toolbar correction

Seven actual native saved-recipe dinner placements now independently reconcile after every Save for both fictional members:5–11 October, revision20→27, seven distinct entries and seven ingredient sources, with no groceries or financial changes from planning. A real36pt meal Save target is corrected through a shared44pt semantic native toolbar button for Add/Replace/Move/Leftovers. Add normal/largest-text dark sizing, real corner cancellation and all seven Save corner taps pass. All1,038 source inputs, strict Mac formatting/limits, signed stable-origin build and18 focused signed-native meal tests pass without failures/skips. [Evidence](../evidence/2026-10-04/swiftui-manual-week/README.md) distinguishes the floating-point observer correction from app changes. Native ingredient selection survives restart; cancelling confirmation posts nothing, and one explicit confirmation adds exactly one chosen source while six remain excluded. Native replacement and dinner-to-lunch move preserve the other six entries, recipe/identity on move and complete finance; original ingredient replay after edits returns the same receipt without duplication. All seven meals and the one grocery are normally removed, with empty week revision37, original checklist and unchanged52-event finance verified for both members. Explicit native review refresh clears the completed receipt; stable origins/signature, Today/default text/light,31 scoped slots and seven meal journals are restored empty with data/Keychain preserved. Both required workflows pass source50247354: Nest37184791007/SwiftUI37184791052,490 Foundation/41 explicit skips and403 signed-native/11 explicit skips, zero failures. Observer corrections (placeholder selector, replacement +2 revision, native toggle/popover/tab geometry) required no further app changes. Live generation/approvals, offline-initiation/concurrency, leftover/maximum-text edit execution, VoiceOver and both phones remain open. TestFlight16 predates this fix; no new beta, merge or production mutation; M5 remains open.

## Meal write online boundary

Two signed-native regression cases reproduced new cached week/recipe saves proceeding without a live week read. New placement/saved placement/replacement/move/leftovers/removal now check current authenticated week terms before journaling; cross-week edits check both weeks. Ingredient addition checks its current revision before changing the saved choices or staging. Existing saved-recipe replacement already has fresh week/library/detail checks. Account-generation/identity/selection fences prevent late old-context saves. Original uncertain intents retain exact retries. All44 focused signed-native tests, including six new regression methods, pass without failures/skips; strict Swift formatting/source limits,1,039 input hashes and signed stable-origin build pass. [Evidence](../evidence/2026-10-04/swiftui-meal-write-preflight/README.md) records controlled transports versus real SQLite. Both required workflows pass source8ec13274: Nest37187300519/SwiftUI37187300500,490 Foundation/41 explicit skips and409 signed-native/11 explicit skips, zero failures. The interrupted real smoke was safely inspected and resumed: one linked-recipe Save advanced37→38; a partner change advanced39 and one stale Save refused without journaling. Immediate typed-title retention passed, but the keyboard covered the maximum-text error and a later field reread failed. Both fixtures were normally removed to empty41 with original groceries/complete52-event finance unchanged. The later keyboard correction below closes this bounded visual failure; no uncertain Save was repeated. No beta, merge, purchase or production mutation; full M5 remains open.

## Meal failure keyboard and input preservation

The largest-text stale Add meal screenshot exposed keyboard occlusion despite accessibility reporting the error hittable. Save now dismisses title focus and scrolling supports interactive dismissal. All1,039 native/build-helper hashes, strict Swift formatting/source limits, signing/stable origins and28 focused signed-native meal tests pass with zero failures/skips. One actual maximum-text stale Save reviewed41 while a partner fixture advanced42, refused without staging and preserved the exact typed title on a later independent read. Full error readability now passes maximum-text/dark and ordinary-text/light screenshots. Both independent complete finance/grocery snapshots stay unchanged; the one partner fixture is normally removed to empty43 and native draft cancellation/refresh/ordinary Today preserves data, Keychain and all empty journals. [Evidence](../evidence/2026-10-04/swiftui-meal-keyboard-failure/README.md). Both required workflows pass exact shipping source6339a87a: Nest37192247205/SwiftUI37192247221,490 Foundation/41 explicit skips and409 signed-native/11 explicit skips, zero failures. Build16 predates this fix. Real radio loss, VoiceOver, remaining meal/approval variants and both phones remain open; M5 is incomplete. No new beta, merge or production mutation occurred.

## Native cross-week leftovers

At both-CI-green shipping source6339a87a, one actual native Add places leftovers into the later week while retaining the original source unchanged. Normal/maximum-text toolbar sizing and real maximum-text corner cancellation pass. A read-only observer captures actual scoped SQLite pending→acknowledged→cleared state; no Add is repeated. Both members independently agree on source44/destination1 and exactly equal retained planned recipes, including ingredients, quantities, instructions, servings, notes and links. Original groceries, library34 and complete52-event finance/balances remain unchanged. Only the known leftover and fictional source are normally removed, restoring empty45/2 and retaining receipts; both weeks are refreshed natively and ordinary Today/stable signature/origins/empty journals/data/Keychain restored. Independent verifier token expiry stopped cleanup during read-only preflight before any remove and was safely renewed without changing native sessions. [Evidence](../evidence/2026-10-04/swiftui-cross-week-leftovers/README.md). Maximum-text Add, full conflict/retry/privacy families, VoiceOver, live AI and both phones remain open; this is bounded M5 progress, not milestone completion. No beta, purchase, production mutation or merge occurred.

## Native daily chore creation and completion recovery

Two actual current-source native daily/shared creations and their completion recoveries now pass on the owned SE3/test API. A committed completion with a dropped reply survives restart and explicit identical-command/receipt replay; another durably offline-queued completion converges with one ordinary partner API completion as `already_completed`, preserving the partner as completer. Automatic native restart replay is honestly observed and blocked by the owned outage. Both members agree on exactly one completion/next-day current occurrence; private receipt RLS and complete52-event finance remain unchanged. Both fixtures are normally archived and ordinary Today/stable signed origins/empty journals/data/Keychain/owned relay/key restoration pass. [Evidence](../evidence/2026-10-04/swiftui-native-chore-completion/README.md). Source for this completion run remains `a0458304`, previously both-CI green; evidence checkpoint `d555c37c` passes Nest37200330043. The Mac outage and verifier label/active-list/key-shadow/token-expiry corrections required no repeated successful saves or archives. The observed18pt Retry sync target and later status-bar overlap are now corrected and owned-verified below; full VoiceOver/haptics/radio loss, changed-schedule conflicts, membership changes, two-native-client/phone and live AI acceptance remain open. No beta, production action or merge occurred.

## Today recovery touch target and viewport correction

Source `9c550f2a` makes Today Retry sync at least44pt and clips the scroll viewport so scrolled maximum-text content stays below the status bar. Actual owned normal/light74.5×44pt and maximum-text/dark227×58.5pt corner taps each cause503 retention followed by real test snapshot200/notice clearing. All1,039 native inputs match; strict Swift formatting/source limits and four focused signed-native recovery tests pass with zero failures/skips. The corrected maximum-text observer requires the whole target above the tab overlay; its terminal missed-corner assumption required no app/domain change. Both candidate stages restore stable signed test origins/default text/light/ordinary Today, empty journals and preserved data/Keychain, stop owned relays and destroy generated keys. Both-member original chore/full52-event finance reads remain unchanged; no mutation requests, new beta, production action or merge occurred. [Evidence](../evidence/2026-10-04/swiftui-today-retry-target/README.md). Exact-source Nest37201092684/SwiftUI37201092688 both pass:490 Foundation/41 explicit skips and409 signed-native/11 explicit skips, zero failures, strict format/limits and actual signing. Full accessibility/phone/AI and M1/M2/M4 acceptance remain open.

## Broader privileged-function source parity and bounded legacy guards

Fresh hosted reads and a disposable302-migration compilation now match all221 authenticated privileged function bodies (81 public/140 private), plus the delegated calendar-lease helper:222 exact-signature body matches. This is provenance, not a semantic safety claim. Seven legacy public access paths now have an actual guard trace,36 two-tenant/unauthorized/lease/rollback SQL checks in the populated rehearsal and eight actual hosted read-only probes. Search and Storage metadata usage remain tenant bound; known connections/tokens do not authorize another household; expired/mismatched/reentrant leases and foreign event IDs are rejected. Authorized partner calls succeed in rolled-back fixtures. Original calendar/Storage metadata/tenancy and full financial/receipt reconciliation remain unchanged. Fixture reservation/output errors were corrected without bypassing the real trigger; only the final complete run counts. [Evidence](../evidence/2026-10-04/legacy-privileged-boundaries/README.md). Focused formatting/lint and exact-head Nest37198811574 pass at `c73117e3`; native shipping source is unchanged. The remaining53 legacy public functions, deeper private semantics, real hosted Auth/Storage migration, workers/APNs, signup/provider decisions, external writers and complete M9 remain open. No hosted calendar/Storage/schema mutation, secret transfer, inference, beta, purchase, production action or merge occurred.

## Next work

The retained-rule editor now exposes its existing Review action above the keyboard with a 44-point target. Twelve focused signed-native adoption tests pass, as do strict Swift formatting, repository formatting/lint and source limits. Actual ordinary/light and largest-text/dark corner presses reach separate consent and cancellation leaves zero commands/POSTs. The largest-text observer's replacement mismatch is recorded explicitly; this is bounded toolbar/navigation evidence, not full fixed-form or hosted adoption acceptance. Existing foreground description retention was verified without rewriting it. Stable test origins and ordinary Today/text/light are restored with preserved Keychain/data, empty journals, stopped owned relay and destroyed generated key. [Keyboard evidence](../evidence/2026-10-04/swiftui-adoption-keyboard/README.md).

Build16 is now the available private candidate, source `5a228bef3078e6da520b311981703367fea478c5`. Nest37175329619/SwiftUI37175329652 pass that exact source:490 Foundation tests with41 explicit skips and403 signed-native tests with11 explicit skips, zero failures, strict format/limits and actual signing. Native archive/export/package checks and the unchanged opaque icon pass with all1,037 source inputs matched. Exactly one submission, `18bf1d0a-d469-41ca-8ff2-cae1ea075094`, is FINISHED; a spaced Apple read establishes16 VALID/IN_BETA_TESTING internally and unexpired. No tester groups/invitations were expanded; partner access and installation remain unverified. [Release evidence](../evidence/2026-10-04/swiftui-build16/README.md), [short phone pass](native-rewrite/build16-first-phone-pass.md). It batches Money/recipe offline reads, retained confirmation/recovery controls, corrected handover status and adoption keyboard Review. Full M1–M9 acceptance, remaining financial families, live AI/worker/push, both phones and safe cutover remain open. PR85 was freshly read as OPEN at head `1c00a089`; its recorded merge exception remains. No production mutation, purchase, cloud build, public release or merge occurred.

Money offline read persistence is implemented for balance, visited history pages and visited entry details. Six real SQLite and20 signed native tests pass locally, zero failures/skips, with strict formatting/source limits. Authorization denial purges scoped read snapshots; fresh-process denial revokes the cached offline scope; cached SDK identity must match. Uncertain commands remain intact, and financial command reads remain online-only. Corrected source `b99795c9` matches all1,033 Mac inputs and passes owned native restart/read-only503 navigation for balance,50+1 history and oldest detail, plus independent two-member unchanged-ledger/isolation reads. A real below-fold saved-warning finding was fixed and retained as evidence. Stable test origins/ordinary Today are restored with empty expense/grocery journals, preserved data/Keychain and stopped relay/destroyed key. Routine CI37167913752 and native CI37167913761 pass:484 Foundation/41 explicit skips and396 signed-native/11 explicit skips, zero failures, strict format/limits/actual signing. Real radio loss, VoiceOver, full large-text/two-member acceptance and phones remain pending; this fix is newer than TestFlight15. [Evidence](../evidence/2026-10-04/swiftui-money-offline-reads/README.md).

The owner-facing [remaining-work checklist](native-rewrite/remaining-work.md) groups the outstanding outcomes into financial completion, native usability, live integrations and a current private build. Most daily surfaces exist; neither test counts nor implementation alone establish final acceptance.

1. Continue the remaining approval/recurring/meal/chore/settings journeys; complete history pagination, failure/retry and navigation now pass the bounded owned-native/hosted check above; ordinary expense interruption/cancellation and keyboard checks now pass with full restoration. Collect owner feedback on the available build16 and continue whole-app Quiet usability/hosted acceptance; private adoption now passes native and corrected routine CI. Direct adoption passes both CI workflows and focused native/backend/variable-form verification. Direct confirmation passes exact-source CI and owned form checks; private confirmation now passes focused Mac/backend/owned alert checks, with exact-source CI now passing at `886773cc` (Nest37141297431/SwiftUI37141297448:463 Foundation/41 explicit skips and344 signed-native/nine explicit skips, zero failures, strict format/limits/actual signing). Direct/private dismissal now pass exact-source native/routine CI. [Audited port notes](native-rewrite/legacy-financial-port-notes.md) record seven actual next-slice server/DB cases, original-term/new-expense separation and prospective opt-in safeguards. Direct dismissal source `8ddb0e35` passes exact-source native/routine CI; its later review/navigation/alert cancellation is now owned-rendered at `8ff82f9a`, while recovery rendering/phones remain pending. Retained inventory/draft history source `441e3ac2` passes exact-source native/routine CI; owned rendering/phones remain pending. Private manual-cycle approval source `853d2996` passes exact-source native/routine CI; owned rendering and phone acceptance remain pending. Ordinary recurring and expense/settlement/refund/correction preflight pass exact-source Foundation/native/routine CI; rendered/phone checks remain. Resumption proposal review/recovery and older approval preflight pass exact-source native/routine CI. Pause/cancel native and routine CI pass; gated test-environment expiry reconciliation and owned rendered checks remain. Rollover source passes CI. Current-source hash comparison, draft review cancellation and ordinary/removed meal navigation now pass owned QA. Continue with saved recovery rendering, settings reload/result navigation and later grocery/routine/chore links. Restore the ordinary app after controlled presentation checks.
2. Continue acceptance against the [action source map](native-rewrite/action-inventory.md). Prove full two-member approval/retry/privacy journeys and current Quiet interactions; implemented source is not completion.
3. After exact provider prerequisites/approval arrive, verify bounded live AI and isolated APNs/worker behavior; keep production untouched.
4. Obtain both-phone/design acceptance of the already-available build16; batch further candidates only when verified changes justify them. Prepare a concrete release/cutover package only after all remaining gates pass.

No new automation was created. No service purchase, production mutation/migration, old-app retirement, public release or merge occurred during these increments.

## Rescheduled queued chore completion and explicit recovery

One actual native daily/shared creation/offline completion/restart encounters one ordinary partner reschedule. The original native retry receives409 and retains its immutable command with reason changed; no completion occurs. Corrected source `c958747c` preserves original recovery presentation terms, maps durable reasons and gives Discard/error Retry44pt-high targets. Its real SQLite test covers changed/removed/forbidden/cutover/future fallback, original title/date/assignee/epoch retention, restart, no replay and explicit discard. Both exact-source workflows pass (Nest37203052230/SwiftUI37203052276):491 Foundation/41 explicit skips and409 signed-native/11 explicit skips, zero failures, strict format/limits and actual signing.

After the genuine Mac outage, read-only inspection established the prior build was complete; the same original conflict survives corrected client update/normal44pt rendering and maximum-text/dark restart with no POST. One actual maximum-text corner Discard normally clears only that saved intent; the canonical later occurrence remains. A terminal observer UUID-case mismatch required only normalized read-only confirmation, never a repeated tap. Independent A/B reads prove zero completions, unchanged original chores and complete52-event histories/balances. The sole fictional routine is normally archived; current-source stable signed test origins/default text/light/ordinary Today, empty31+7+chore5/outbox, preserved data/Keychain and owned relay/awake/key teardown pass. [Evidence](../evidence/2026-10-04/swiftui-chore-reschedule-conflict/README.md).

The narrow follow-up `46c75247` also makes the short failed-state Retry label44pt wide. Its1,039-input stable signed Mac build and strict formatting/source limits pass; Nest37204339120 passes, SwiftUI37204339172 also passes (491 Foundation/41 explicit skips,409 signed-native/11 explicit skips, zero failures). Cold failed-state Retry rendering remains unverified. Actual sourcec958 conflict rendering is distinguished from follow-up stable restoration; no broader recurrence, membership-change, VoiceOver/haptics/radio-loss, two-native-client/phone or live AI acceptance is claimed. M1–M9 remain open. No beta, purchase, production action or merge occurred.

## Readable saved chore status and archived-occurrence recovery

Actual screenshot review found faded conflict information in a disabled completion button. Source `177d0a70` now presents saved pending/completed/conflict rows as readable semantic information, with clock/check/review symbols and a separate44pt Discard; only open work is actionable. A distinct native-created daily/shared routine is completed during owned outage, survives restart, then is normally archived by B. One exact native retry returns real409/changed with removed canonical row and retained original terms; this is not live410/removed-reason proof. Normal/full-color accessible title/status and maximum-text/dark restart/no POST pass. One maximum-text corner Discard clears the intent without replacement completion or another archive. Independent A/B zero-completion/original snapshot/full52-event finance checks and stable signed origins/ordinary Today/empty journals/preserved data/Keychain/owned helper/key cleanup pass. [Evidence](../evidence/2026-10-04/swiftui-chore-readable-recovery/README.md).

All1,039 native inputs match. Exact-source Nest37205046774/SwiftUI37205046782 both pass:491 Foundation/41 explicit skips and409 signed-native/11 explicit skips, zero failures, strict format/limits and actual signing. Previous evidence checkpoint36098998 passes routine CI37204866418. Actual VoiceOver speech/focus, haptics/radio loss, full recurrence/membership/two-native-client/phone and live AI acceptance remain open; M1–M9 remain incomplete. No financial write, beta, purchase, production action or merge occurred.

## Retained reschedule date boundary

The adjacent old reschedule RPC accepts infinite due dates. Its new guard rejects
new null/nonfinite/unsupported years, retaining all finite dates and old exact
replies/history. Eleven focused real database tests and the305-migration rehearsal
pass:31 parent/date boundaries plus existing tenant/attachment/reconciliation and
epoch/AI dispatch checks. Manifest55/251 and four manifest tests pass; scoped format,
lint and source limits pass. Applied only to nest-test (hosted20261004151736): exact body/ACL, ten live negative
Auth/PostgREST probes and unchanged complete finance/attachments/routine history
pass. Routine37212413311 caught saved-report formatting, now corrected with passing
repository format checking. Corrected routine37212616501 passes e2c9b536; source deep37212413167 passes138c1b01
(23 core,50 conflicts,1,239 database/RLS, zero failures/skips). Migration/tests/tooling
are unchanged by the evidence correction;
48 other public legacy functions/deeper private paths remain. [Evidence](../evidence/2026-10-04/legacy-reschedule-date-boundaries/README.md).
Prior completion evidence checkpoint1a3e060c passes Nest37212140744. M9 remains open;
no new native run, production mutation, inference, purchase, beta or merge occurred.

## Retained routine lifecycle boundaries

Pause/resume/archive/skip now have a bounded guard trace,20 rolled-back full-chain
checks and eight real hosted outsider/anonymous denials. Both members' exact repeat
replies, window/skip state, private recipient reminders and cancellation/restoration
pass. All original local/hosted routine/closure/full finance/attachment rows or digests
remain unchanged. Four fresh hosted bodies/ACLs match the audited source. Initial
helper-parameter and private-reminder observer assumptions were corrected without
weakening limits/RLS. Focused format/lint and exact-source routine CI37213217127
pass at2e114f04. The20 new full-chain cases are locally executed; no new deep/native
run is claimed for them. [Evidence](../evidence/2026-10-04/legacy-routine-boundaries/README.md).
Forty-four other legacy public functions/deeper private paths remain; this is bounded
M9 progress, not full semantic/phone/provider acceptance. No shipping SQL, production,
notification, worker, beta, purchase or merge action occurred.

## Native existing-expense cycle linkage

One actual native explicit link now covers4 October using an existing CHF1.01
expense against a fictional CHF0.03 rule. Both members independently agree on
one retained manual cycle and next due11 October; the exact expense, complete52-event
histories/balances and all finance/attachment digests stay unchanged. The operation
receipt remains private. Normal52pt confirmation, largest-text amount/period review,
actual restart/exact recorded-receipt recovery, original-detail navigation and normal
Finish recovery pass. The fictional rule is normally paused; its cycle/history remain.
Ordinary Today/default text/light, empty journals, preserved data/Keychain and stable
signed test origins are restored. All1,041 native/helper inputs match; the installed
executable exactly matches the retained signed build. [Evidence](../evidence/2026-10-04/swiftui-native-manual-cycle-link/README.md)
records observer corrections and Swift nil-field serialization reconciliation.

Shipping native source remains both-CI-green177d0a70; no new compile/unit run is
claimed. The prior retained-lifecycle checkpoint97ea840a is now freshly confirmed
Nest37213542541 SUCCESS. Lost replies, offline/concurrent/private-AI variants,
maximum-text confirmation/finish tapping, full accessibility and both phones remain
open; M7 acceptance is incomplete. No new expense, beta, production mutation,
purchase, worker activation or merge occurred.

## Retained routine definition boundaries

Three further legacy public warning entries now have a bounded source/guard trace,
52 actual rolled-back full-chain database checks and nine real hosted Auth/PostgREST
denials. Foreign/absent membership, foreign tenant references, patch injection,
revoked unversioned update, exact creation/edit replay, changed creation identity,
instruction clearing and stale edits pass. Four fresh hosted bodies and client
grants match the compiled305-migration chain. All original local/hosted routine,
completion, receipt, full financial and attachment rows/digests remain unchanged.
No defect requiring a shipping SQL change was found in these tested paths.
[Evidence](../evidence/2026-10-04/legacy-routine-definition-boundaries/README.md).

The52 new cases have local execution evidence; exact-source routine CI37219093738
passes at a8928b51, and no new deep/native run is claimed. Native manual-link evidence source
6d53901e now passes Nest37217179614; shipping native source remains177d0a70.
Fresh hosted advisor counts remain61INFO/81 privileged WARN/one leaked-password
WARN. Forty-one other public legacy entries plus deeper private paths, full safe
cutover and live/provider/phone acceptance remain. This is bounded M9 progress;
all previously unchecked milestones stay open. No successful hosted mutation,
production action, beta, purchase, worker activation or merge occurred.

## Native PDF receipt picker

One actual Apple document-picker selection now uploads a synthetic660-byte PDF to
private nest-test Storage. Picker cancellation leaves no intent; uploader-only
exact-byte/API reads, partner/outsider/anonymous denials and complete52-event finance
retention pass. Actual terminate/launch retains identical PDF bytes/reservation.
One343×155.5pt maximum-text/dark native corner Remove deletes only this unposted PDF;
fresh Storage absence, household410 Gone, unchanged pending inventories and the
existing claimed receipt's exact bytes for both members pass. The known local PDF
is removed, normal/light Today restored and all64 scoped journals empty, preserving
data/Keychain. All1,041 native inputs, installed signature, retained executable and
stable test origins match. [Evidence](../evidence/2026-10-04/swiftui-native-pdf-receipt/README.md).

Shipping native source remains both-CI-green177d0a70; this is actual native/hosted
verification, not a new build/unit run. PDF evidence checkpoint03bb1bec now passes
exact-source routine37220894854. The preceding definition audit checkpoint
a8928b51 passes routine37219093738. Other PDF providers/invalid input, newly posted
attachments, partner native viewer, interruption/full accessibility, live AI and
both phones remain open. The observed system-owned picker Cancel rectangle is
36.5×36pt, with no44pt/full-accessibility claim. M7 and all other unchecked milestones
remain incomplete. No expense, approval, beta, production action, purchase, worker
activation or merge occurred.

## Native partial/full settlement and stale review

One actual native partial payment now records one centime, survives process restart
with its exact receipt, opens native detail/shares and normally finishes. A reviewed
CHF1.02 full payment is refused after one ordinary partner test-API centime payment:
original terms/note remain, all64 scoped journals stay empty and no event is added.
Explicit reload/review and one maximum-text/dark343×155.5pt corner Save record only
the101-centime remainder. Both members agree on exact52 original plus3 new events,
zero balances and−1/+1 or−101/+101 details; operation receipts stay owner-only.
Exact existing-operation API replay adds nothing; changed-note replay is refused400
with the original receipt intact. All original financial/allocation/ledger/claimed
Storage digests match. Normal terminal Done and readable maximum-text settled copy
pass; normal/light Today/data/Keychain and64 empty journals are restored.
[Evidence](../evidence/2026-10-04/swiftui-native-settlement/README.md).

The payment journeys are bound to both-CI-green177d0a70. A separately source-matched
signed Mac build/native detail check now clarifies signed balance changes: negative
can mean owed less, positive can mean owing less. Only this explanation changes
among1,041 native inputs; no new local unit run is claimed. Exact-sourcec45b265b
passes Nest37227213383/SwiftUI37227213372:491 Foundation/41 explicit skips,
409 signed-native/11 explicit skips, zero failures, strict formatting/limits and
actual signing. Native lost-reply/cancellation/private approval variants, broader member/
concurrency families, full accessibility/radio loss, two native clients and both
phones remain open. M7 and other unchecked milestones remain incomplete. No actual
transfer, beta, production change, purchase, worker activation or merge occurred.

## Native refund/correction and keyboard controls — 4 October

Actual refund/correction forms now have persistent distinct field labels and
44-point Done/Review controls above the keyboard. One native fictional1-centime
refund and one5-centime replacement pass normal/maximum-text review, single Save,
actual restart, exact receipt reopen and native detail/shares/Done. An active
refund honestly blocks correction of its original. Both members agree on exact55
original plus3 appended entries and zero balances; original financial/allocation/
ledger/claimed Storage metadata digests match. Private operation receipts remain
owner-only; outsider403/anonymous401. Ordinary normal/light Today, preserved data/
Keychain/stable origins and all64 scoped journals empty are restored.
[Evidence](../evidence/2026-10-04/swiftui-native-refund-correction/README.md).

Both journey and final1041-input signed Mac builds pass strict formatting/limits
and six native recovery/preflight/account-boundary tests,0failures/0skips. Final
source additionally removes duplicate share headings and receives a separate
unsaved native check. Exact-source6c05bdb4 passes Nest37231483788/SwiftUI37231483842:
491 Foundation/41 explicit skips,409 signed-native/11 explicit skips, zero failures,
strict formatting/limits and actual signing. Native interruption/cancellation/private approval variants,
broader races/full accessibility/radio loss/two native clients/live AI/both phones
remain open. M7 and other unchecked milestones remain incomplete. No beta, merge,
production change, actual transfer, purchase or worker activation occurred.

## Legacy direct financial authorization review — 4 October

Four more legacy public entry points now pass52 full-chain disposable cases:
current membership/tenant payer/category/allocation guards, safe centimes/refund
limits, active-refund blocking, both-member zero-sum posting/exact retries and
changed-payload/nonmember historical refusal. All305 migration inputs apply with
only the exact pg_net declaration excluded; original finance/receipts/metadata
remain unchanged. Four fresh hosted bodies/client grants match the compiled
chain; eight verified outsider/anonymous RPC refusals return401/403+42501 with
all58 hosted financial/ledger/allocation/claimed Storage digests unchanged.
[Evidence](../evidence/2026-10-04/legacy-financial-boundaries/README.md).
Final focused lint/format/limits pass without exceptions; earlier helper-size/
parameter errors were corrected. Exact-source80909db7 passes routine CI37233023935;
the52 full-chain cases ran locally, not in that routine workflow. All1041 native
inputs remain identical to both-CI-green6c05bdb4. Thirty-seven other legacy public entries and deeper
private paths remain. M9 remains incomplete; no schema/production change,
successful hosted financial mutation, purchase, beta, worker activation or merge.

## Legacy meal boundaries

Seven retained meal commands now pass 130 full-chain PostgreSQL authorization,
reference and retry cases, including populated library/leftover side effects.
Their hosted bodies/grants match; fourteen real outsider/anonymous requests
are refused, with meals, groceries, routines and all 58 financial events unchanged.
[Evidence](../evidence/2026-10-04/legacy-meal-boundaries/README.md) distinguishes
legacy automatic groceries/source-link retries from native approval semantics.
Exact source `3abe3df7` passes routine CI37234581666; the 130 cases ran locally. Thirty other legacy public entries
and deeper private paths remain. M9 stays open; no native/provider/schema change,
successful hosted mutation, production action, beta or merge occurred.

## Native variable bill confirmation — 4 October

The form now keeps amount/share labels and has44pt native Done/Review keyboard
controls. Incomplete shares are refused without journaling; typed input survives
review/edit and an unintended driver tab switch. Real normal/maximum-text dark
keyboard Review corners and one maximum-text Record pass. The final recovery
view uses immutable receipt description/payer/note and a Recorded bill heading.
Two focused native recovery/preflight methods pass twice, including final source,
with0failures/0skips, strict format/limits,1,041 matching inputs and actual signing.

One native3-centime A3/B0 variable bill appends one event:58→59, balances unchanged.
Both-member detail/coverage, owner-only recovery, outsider/anonymous denial and
one exact known-operation HTTP replay pass. Actual restart and signed client
update retain the exact command/receipt; reopening, native detail and Done work.
Same58-ID raw financial/allocation/ledger/claimed Storage metadata digests match.
Only the fictional rule is normally paused;59 events and other rules remain.
Ordinary/light Today, stable test origins, data/Keychain and64 empty journals are
restored. [Evidence](../evidence/2026-10-04/swiftui-native-variable-bill/README.md)
distinguishes first-source keyboard/Save from final-source recovery. Exact-source3e0d377b passes Nest37237659698/SwiftUI37237659725:491 Foundation/41
explicit skips and409 signed-native/11 explicit skips, zero failures, strict
format/limits and actual signing. A read-only real-midnight snapshot shows
Today’s header4→5October with64 journals still empty; background/meal convergence
and token renewal are not established. Hosted lost reply/cancellation, private approval variants,
full accessibility/races/two clients/live AI/both phones remain open. No beta,
production action, purchase, worker activation or merge occurs; M7 is incomplete.
