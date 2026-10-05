# Nest progress

Updated 5 October 2026. **The goal is active and incomplete. M0’s native-execution foundation gate is verified; M1–M9 acceptance gates remain open.** [ADR0002](adr/0002-swiftui-client.md) makes SwiftUI authoritative; Expo/RN client code and dependencies are removed. The Effect v4/Vercel AI SDK backend, financial/privacy rules and approved Quiet design remain in force.

Source work is on Linux, `/home/drrius/Work/nest`; owned Xcode/simulator work uses the isolated `/private/tmp/nest-current-qa-82a` mirror on the Mac; the original `/Users/dariussibarium/Developer/nest-swiftui` mirror is preserved. Native CI is separate from that owned simulator. The full prior log is preserved in [dated evidence](progress-history-2026-10-01.md); its old build numbers and pending states are historical.

## Available candidate and current source

**Latest private candidate: SwiftUI 0.1.0/build17**, source `fad84b0b`. Both exact-source CI workflows, the signed Mac archive/export and Apple VALID/IN_BETA_TESTING/unexpired checks pass. [Release evidence](../evidence/2026-10-05/swiftui-build17/README.md). Next owner action: update Nest in TestFlight and try the [short phone pass](native-rewrite/build17-first-phone-pass.md). Partner access, installation and phone/design acceptance remain unverified. AI, scheduled posting/reminders and push remain inactive; production is untouched. Older candidate statements below are historical.

Build17 batches verified post-build16 keyboard/large-text, meals/preferences, private memory consent, financial review/cancellation and chore recovery fixes. Source `fad84b0b` passes routine37284897061/native37284896959 CI:496 Foundation/41 skips,418 signed-native/11 skips, zero failures. All1,045 native inputs and package checks match. Exactly one private submission `12f9cf8d-a30f-4d3c-b3e0-82d834614d79` finished; the spaced Apple check at08:53:58 UTC establishes internal availability. Temporary signing keys/passwords were removed with original credentials/search list preserved. No cloud build, expanded invitations, purchase, public release or source merge occurred.

Detailed earlier slice checkpoints, including previous candidate numbers, remain in [the 4 October history](progress-history-2026-10-04.md). Later evidence below supersedes their pending states.

## Calendar reading verification — 5 October

The three Calendar permission controls now pass actual reading tests at all12 supported text sizes on the owned SE3:11 light configurations plus maximum/dark. Minimum access target is49pt; all three grow monotonically. The unknown-partner-availability paragraph separately passes normal/light and maximum/dark through overlapping scrolling viewports, growing from94.5pt to651.5pt. Test-observer failures and corrections are retained; no app behavior or audit filtering changed. All639 compiled inputs match; signature/test origins/push-disabled gates,64 empty command journals and restoration to ordinary Today/large/light pass. Lint/format/Swift limits pass; source `57e0d75f` passes routine37302536475/native37302536531 CI. The full five-test audit remains failing with20 unsuppressed reports; this is bounded native reading proof, not M1/M6/M9 acceptance, VoiceOver or both-phone proof. [Evidence](../evidence/2026-10-05/swiftui-accessibility-audit/README.md). No model call, access grant, sharing/household/financial change, beta submission, merge or production action occurred.

## Milestone checklist

### Retained schedule validation — 5 October

Missing required schedule fields were confirmed to return SQL NULL/true from the
retained database validator. A source fix now requires exact fields/types and
revalidates the original table CHECK without modifying retained rows. Eight
focused database tests and the308-migration disposable rehearsal pass, preserving
chore/financial/receipt history; formatting/lint/limits and four manifest tests pass.
[Evidence](../evidence/2026-10-05/routine-schedule-validation/README.md). Approval
review recovered; nest-test20261005124055 now has all six exact source bodies and
a validated CHECK, ten passing probes,19 valid retained definitions and unchanged
fingerprints across nine chore/finance/Storage tables (61 financial events).
Existing advisor notice names remain; no validator notice. Routine CI37309163039
passes source `b035e9e2`, including all eight tests. Production is untouched.
Native PDF browsing/cancellation now passes strict picker-gone/form-hittable and
Today-selection checks,641 matching inputs and64 empty journals. A subsequent
real PDF selection/upload/removal now passes: one matching640-byte intent is
deleted, no object/pending intent remains and all nine fingerprints stay exact.
The existing receipt and61 financial events are preserved; Today/large/light and
64 empty journals are restored. [PDF evidence](../evidence/2026-10-05/swiftui-pdf-receipt/README.md).
Independent downloaded bytes, new posted receipts, partner viewing and phones stay open.
Cancellation source `4195090a` passes Nest37312018896/SwiftUI37312018914;
the subsequent upload-method source has owned native/hosted proof and pending CI.

Unchecked means complete acceptance is outstanding, even where implementation and bounded verification exist.

- [x] **M0 — Decisions and native execution.** Approved ADRs/action inventory, source/build/environment identity, repeatable signed local Xcode/native CI execution and internally available build17 installation path are verified. Current source-matched clean signed-out cold launch and real scoped-session four-tab smoke pass. [Criterion-by-criterion audit](../evidence/2026-10-04/swiftui-m0-foundation/README.md). The plan explicitly separates physical permission/calendar/push acceptance; both-phone installation/sign-in remain M3/M6/M8/M9 gates. Full M1–M9 acceptance stays open.
- [ ] **M1 — Quiet native interactions.** Four SwiftUI tabs and real-data surfaces exist, with selected rendered and large-text simulator evidence. The [artwork inventory](native-rewrite/artwork-inventory.md) now audits the single generated-icon source, native symbols and build13 packaging. Full populated/error/keyboard/VoiceOver/Reduce Motion review and owner design acceptance remain.
- [ ] **M2 — Authenticated offline/AI slice.** Keychain, verified sessions, scoped SQLite and limited exact replay are implemented and tested. Private chat, streaming/interruption/cancellation and honest handoffs exist. Live AI still fails Gateway eligibility403; successful live tool/stream behavior and both-member phone/offline acceptance remain.
- [ ] **M3 — Identity, onboarding and settings.** Quick/comprehensive setup, progressive entry, food/cooking/notification preferences and private-memory consent/recovery exist. New online preflight, canonical settings-result links and account/read fences pass CI. Normal-text owned native saves/lost-reply recovery/stale-form refusal and hosted populated-goal privacy pass. Private-memory pending restart, explicit save/edit/decline/removal, populated RLS and non-resurrecting old-consent replay now pass; both-member forms, broader setup/private settings, accessibility and hardware enrollment remain.
- [ ] **M4 — Today, chores and groceries.** Today filters, ordinary/alternating chore commands, handovers, grocery CRUD/checking, exact scoped SQLite retry/conflicts and corresponding AI commands exist. Source/native/property/RLS checks and selected hosted/owned flows pass. Current grocery edit preflight, retained fields, explicit latest-item reload, committed lost-response restart/update/exact retry, precise removed-intent copy/discard and normal/large-text touch targets now pass owned test-API execution with normal cleanup and unchanged money. Earlier checkbox compatibility/opposing-intent cases and grocery→expense switch/back also pass. Both required grocery-source CI workflows pass. Two-native-client/phone chores/handovers, broader settings/navigation, VoiceOver/haptics/radio loss and complete daily-use acceptance remain open; full M4 is not closed.
- [ ] **M5 — Meals and planning.** Week/library/recipe CRUD, saved/one-off placement, move/replacement/removal, proposals, ingredients and preparation exist. A manual seven-day saved-recipe cycle, preparation and replacement have bounded real native/two-member evidence with normal cleanup. Varied portions/partner constraints, live generation/replacement and full phone/UI acceptance remain.
- [ ] **M6 — Read-only Calendar.** EventKit, permission/selection, agenda/layers and explicit numeric-only busy sharing exist. Selected real timed/all-day/DST, both-member sharing, outsider denial and online cleanup pass; durable offline removal and races have focused tests. Hardware offline/reconnection, long background periods, complex calendars and full accessibility/privacy journeys remain. Personal event text stays on-device.
- [ ] **M7 — Money.** Native balance/history/detail, financial commands/private approvals, receipt storage, recurring controls/variable bills and exact recovery exist over append-only CHF-centime history. Selected arithmetic/isolation/lost-response/hosted checks pass. Pause/cancel proposal review and exact recovery pass focused native CI; resumption proposal review/recovery passes current-source native CI; variable-cycle proposal review/decision/recovery is implemented with local wire/database checks and exact-source Foundation/native/routine CI passing; manual-cycle selection/review/command recovery passes local checks and exact-source Foundation/native/routine CI; private manual-cycle approvals and retained legacy inventory/draft history pass exact-source native/routine CI. Direct legacy dismissal passes local checks and exact-source native/routine CI; its original-term review/navigation/alert cancellation now pass owned rendering. Private dismissal approval/withdrawal passes local and exact-source native/routine CI; original-term review/navigation/alert cancellation now pass owned rendering. Actual rendered recovery states and full phone journeys remain pending. Direct draft-to-expense confirmation now has native source and focused Mac/database verification; both required workflows and actual fictional keyboard/review/cancel rendering pass at direct-confirmation source `4759e124`. Private confirmation review/recovery now has native source with focused Mac/backend and actual fictional alert verification; both focused native offline discovery/isolation checks pass; exact-source CI passes at `886773cc` (463 Foundation/41 explicit skips and344 signed-native/nine explicit skips, zero failures). Direct rule adoption source `e3e6b1ef` now has explicit fresh terms, prospective coverage/member/day preflight and exact recovery; focused Mac/backend and actual fictional variable-form checks pass. Nest37142967731 passes and SwiftUI37142967820 also passes:468 Foundation/41 explicit skips and357 signed-native/10 explicit skips, zero failures, strict formatting/source limits and actual signing. Private adoption now has source and focused Mac/backend/fictional-form verification; native CI at `1151caad` and corrected routine CI at `83a5a015` pass; hosted/provider/phone acceptance and recovery rendering remain pending. [Source coverage](native-rewrite/action-inventory.md#swiftui-financial-approval-coverage-1-october-2026) records the exact gaps. Ordinary expense/settlement and refund/correction staging now require fresh scoped domain reads before new intent; both slices pass exact-source Foundation/native and routine CI. Recurring create/edit/state/resume/variable staging now has fresh membership/revision/server-day/uncovered-cycle checks,23 focused local integration cases passing and exact-source Foundation/native/routine CI passing. Expense/refund/correction/settlement/rule approval staging now has fresh exact private pending/unexpired reads, with all six new native cases and ten existing exact-recovery cases passing current-source CI; existing account checks and later online retries do not prove that offline initiation is blocked. All approval/recurring variants, full history reconciliation and native/two-phone acceptance remain. Production posting is inactive.
- [ ] **M8 — Renewals, reminders and push.** Renewal CRUD, recipient reminder editors, saved summaries, direct APNs transport, registration/outcomes, bounded worker and protected routes exist with fixture/native/selected hosted evidence. Wider linked/pagination/conflict cases, populated summaries, provider credentials, worker activation, real hardware enrollment and all six delivery kinds on both phones remain. Push is disabled in the current build17.
- [ ] **M9 — Migration and release rehearsal.** Safe synthetic reconciliation/recovery exists; the latest54-legacy/251-native fixture passes with explicit infrastructure exclusions. Local signed binary/internal TestFlight packaging passes. Hosted current-chain reconciliation, external-writer/old-intent drainage, final release source and both-member usability remain. Production cutover, old-app retirement, purchases and public release are separately gated.

## Latest native receipt recovery

The actual native Photos picker now uploads an audited synthetic fixture to private nest-test Storage. Its exact1,476 normalized JPEG bytes/hash match independent uploader reads; partner, outsider and anonymous requests are denied while unposted. The same native reservation/bytes survive restart and a signed client update. One native Remove deletes only this object, with a deliberately lost reply retaining the scoped cleanup intent; reopening emits no write. Two explicit largest-text corner retries return the same deletion result, one also losing its reply, then normally clear the slot. A misleading smaller-photo error is corrected to removal-specific guidance. Nine focused Foundation/three signed native tests pass with no failures/skips, strict formatting/source limits and1,039-input matching. Both full52-event histories/balances and the existing claimed receipt remain intact; pending inventories are restored. Ordinary Today/stable signed test origins, empty31+7+receipt slots, preserved data/Keychain and owned relay/key teardown pass. [Evidence](../evidence/2026-10-04/swiftui-native-receipt-recovery/README.md). Exact source `a0458304` now passes Nest37195153704/SwiftUI37195153685:490 Foundation cases/41 explicit skips and409 signed-native cases/11 explicit skips, zero failures, strict format/limits and actual signing. The existing claimed receipt also renders through native history/detail/browser navigation and returns to the same entry; both complete histories/Storage remain unchanged. [Viewer evidence](../evidence/2026-10-04/swiftui-claimed-receipt-viewer/README.md) records corrected offscreen/close-icon observer assumptions without repeated opens or signed-URL exports. The later PDF checkpoint above supersedes picking/upload/removal; independently downloaded PDF bytes, new posted attachments, partner native viewing, full accessibility, live AI handoff and both phones remain open. No expense, beta, production action or merge occurred; M7 remains incomplete.

## Earlier verification

Earlier source-specific test totals and result-link checks are preserved in [the 5 October history](progress-history-2026-10-05.md).

## Exact blockers and owner inputs

- **Native QA:** current grocery rendering/recovery and final stable-origin restoration are verified on the owned simulator; no active fault relay, generated private key, test groceries or unresolved grocery/expense intent remains from this pass. Both exact-source CI workflows pass; no CI result remains pending for this bounded grocery source. Ordinary expense interrupted-save/cancellation and keyboard checks also pass; Full history pagination now passes the later owned-native/hosted check above; approvals/recurring, meal/chore/settings journeys, full accessibility and both phones remain open. Future Mac availability must be inspected when the next owned run begins; the temporary one-hour awake process has finished.

- **AI eligibility:** the last real Swift/provider checks returned Gateway403 `customer_verification_required`; credits/usage0/0. Owner: check the existing valid card on [drrius-projects billing](https://vercel.com/drrius-projects/~/settings/billing), finish any verification prompt and report the changed eligibility. No credits purchase/upgrade is requested. Existing project-only USD1 nonrefreshing cap stays unchanged; then perform one bounded live recheck. The CHF20/month ceiling remains.
- **Legacy completion boundary:** a direct legacy RPC could write a future completion date. New commands now reject future/nonfinite/unsupported dates while preserving historical exact replies. Seven focused database tests and the304-migration rehearsal pass, including21 document/profile/completion-photo/date probes and existing real database AI/epoch dispatch. Manifest55/250 and all four manifest tests pass. Applied only to nest-test (hosted20261004144314): exact body/ACLs, ten real Auth/PostgREST negative probes and unchanged complete finance/attachments/routine history pass. Routine37210225147 and Deep37210426388 pass exact source c5469baf (23 core,50 conflicts,1,235 database/RLS, zero failures/skips). No new native execution claimed;49 other legacy public functions/deeper private paths remain. [Evidence](../evidence/2026-10-04/legacy-completion-date-boundaries/README.md). Prior receipt cleanup checkpoint1d67f235 now passes Nest37208513631. M9 stays open.
- **Receipt cleanup:** two retained legacy cleanup RPCs could invalidate another member's old private native receipt intent. The uploader guard now passes17 focused database tests and the303-migration disposable rehearsal, with16 new attachment boundary probes and exact retained finance/receipt reconciliation. Applied only to `nest-test`: hosted bodies/ACLs match, all52 financial events plus allocation/ledger/upload/intent/Storage digests stay unchanged. Source956cd927 routine CI37207407493 caught the omitted migration checksum entry; it is corrected and four local manifest tests pass. Corrected source3b141cc5 passes routine CI37207727428; deep37207534599 passes unchanged SQL/tests with23 core,50 conflicts and1,231 database/RLS cases, zero failures/skips. [Evidence](../evidence/2026-10-04/legacy-receipt-cleanup/README.md). Existing81 privileged-function warnings remain; ten legacy public RPCs now have bounded reviews, with50 others/deeper private paths open. M9 stays open.
- **Test API:** preview `nest-test-kjn4mw4di-drrius-projects.vercel.app`, backend source `83a5a015`, is READY and now serves the already-authorized stable test API alias. Seventeen read-only checks pass on the preview and again on the stable address: both members see the expected test household, an outsider gets403, anonymous money access gets401 and the recurring worker returns404 while disabled. Existing preview configuration was reused; no server secret was transferred, scheduler activated, financial write/model call sent or production data touched. Hosted populated legacy/approval/provider journeys remain unverified.

- **Worker credential transfer:** automatic approval review rejected exporting the test Supabase server key and scheduler token to Vercel because prior test-deployment authorization did not explicitly cover that transfer. A specific owner approval question is already pending. No transfer, alternate path, schedules or worker activation occurred.
- **APNs:** server-side provider `.p8`, key ID/team/configuration, worker activation and real hardware token/enrollment/six-kind delivery on both phones remain needed. App Store Connect signing credentials are not an APNs provider key. Push stays disabled.
- **Phones:** both partners need the identified build17 installation, Apple sign-in and [phone checklist](native-rewrite/swiftui-phone-acceptance.md), followed by complete weekly/financial-approval/offline-conflict/calendar/privacy/accessibility acceptance. Actual partner tester access is still unverified. Pending phone-feedback questions should not be duplicated.
- **Merge:** [PR85](https://github.com/drrius/nest/pull/85) was freshly read on5 October as OPEN/CLEAN and retains the specific recorded automatic-review exception. The Sol waiver does not erase it; no local/main merge bypass. New source is pushed on feature branches with CI.
- **Cutover:** existing-data/current-chain reconciliation and external-writer/old-intent drainage precede any production migration, retirement or public release. Safe fixtures and private testing do not authorize these actions.

## Earlier native and migration checkpoints

Handover, offline reads, retained confirmations, preferences and manual-meal checkpoints are retained in [5 October history](progress-history-2026-10-05.md). Their bounded results do not close the milestone gates.

## Broader privileged-function source parity and bounded legacy guards

Fresh hosted reads and a disposable302-migration compilation now match all221 authenticated privileged function bodies (81 public/140 private), plus the delegated calendar-lease helper:222 exact-signature body matches. This is provenance, not a semantic safety claim. Seven legacy public access paths now have an actual guard trace,36 two-tenant/unauthorized/lease/rollback SQL checks in the populated rehearsal and eight actual hosted read-only probes. Search and Storage metadata usage remain tenant bound; known connections/tokens do not authorize another household; expired/mismatched/reentrant leases and foreign event IDs are rejected. Authorized partner calls succeed in rolled-back fixtures. Original calendar/Storage metadata/tenancy and full financial/receipt reconciliation remain unchanged. Fixture reservation/output errors were corrected without bypassing the real trigger; only the final complete run counts. [Evidence](../evidence/2026-10-04/legacy-privileged-boundaries/README.md). Focused formatting/lint and exact-head Nest37198811574 pass at `c73117e3`; native shipping source is unchanged. The remaining53 legacy public functions, deeper private semantics, real hosted Auth/Storage migration, workers/APNs, signup/provider decisions, external writers and complete M9 remain open. No hosted calendar/Storage/schema mutation, secret transfer, inference, beta, purchase, production action or merge occurred.

## Next work

The retained-rule editor now exposes its existing Review action above the keyboard with a 44-point target. Twelve focused signed-native adoption tests pass, as do strict Swift formatting, repository formatting/lint and source limits. Actual ordinary/light and largest-text/dark corner presses reach separate consent and cancellation leaves zero commands/POSTs. The largest-text observer's replacement mismatch is recorded explicitly; this is bounded toolbar/navigation evidence, not full fixed-form or hosted adoption acceptance. Existing foreground description retention was verified without rewriting it. Stable test origins and ordinary Today/text/light are restored with preserved Keychain/data, empty journals, stopped owned relay and destroyed generated key. [Keyboard evidence](../evidence/2026-10-04/swiftui-adoption-keyboard/README.md).

Build16 is now the available private candidate, source `5a228bef3078e6da520b311981703367fea478c5`. Nest37175329619/SwiftUI37175329652 pass that exact source:490 Foundation tests with41 explicit skips and403 signed-native tests with11 explicit skips, zero failures, strict format/limits and actual signing. Native archive/export/package checks and the unchanged opaque icon pass with all1,037 source inputs matched. Exactly one submission, `18bf1d0a-d469-41ca-8ff2-cae1ea075094`, is FINISHED; a spaced Apple read establishes16 VALID/IN_BETA_TESTING internally and unexpired. No tester groups/invitations were expanded; partner access and installation remain unverified. [Release evidence](../evidence/2026-10-04/swiftui-build16/README.md), [short phone pass](native-rewrite/build16-first-phone-pass.md). It batches Money/recipe offline reads, retained confirmation/recovery controls, corrected handover status and adoption keyboard Review. Full M1–M9 acceptance, remaining financial families, live AI/worker/push, both phones and safe cutover remain open. PR85 was freshly read as OPEN at head `1c00a089`; its recorded merge exception remains. No production mutation, purchase, cloud build, public release or merge occurred.

Money offline read persistence is implemented for balance, visited history pages and visited entry details. Six real SQLite and20 signed native tests pass locally, zero failures/skips, with strict formatting/source limits. Authorization denial purges scoped read snapshots; fresh-process denial revokes the cached offline scope; cached SDK identity must match. Uncertain commands remain intact, and financial command reads remain online-only. Corrected source `b99795c9` matches all1,033 Mac inputs and passes owned native restart/read-only503 navigation for balance,50+1 history and oldest detail, plus independent two-member unchanged-ledger/isolation reads. A real below-fold saved-warning finding was fixed and retained as evidence. Stable test origins/ordinary Today are restored with empty expense/grocery journals, preserved data/Keychain and stopped relay/destroyed key. Routine CI37167913752 and native CI37167913761 pass:484 Foundation/41 explicit skips and396 signed-native/11 explicit skips, zero failures, strict format/limits/actual signing. Real radio loss, VoiceOver, full large-text/two-member acceptance and phones remain pending; this fix is newer than TestFlight15. [Evidence](../evidence/2026-10-04/swiftui-money-offline-reads/README.md).

The owner-facing [remaining-work checklist](native-rewrite/remaining-work.md) groups the outstanding outcomes into financial completion, native usability, live integrations and a current private build. Most daily surfaces exist; neither test counts nor implementation alone establish final acceptance.

1. Continue complete two-member Money/approval/recurring, meal, chore, settings and offline-conflict journeys on current source. The checkpoints below and dated history are bounded evidence; keep the ordinary app restored after owned fixture checks.
2. Continue acceptance against the [action source map](native-rewrite/action-inventory.md), six listed retained public entries and broader private helpers/races/external writers. Prove full two-member approval/retry/privacy and Quiet interactions; implemented source is not completion.
3. After exact provider prerequisites/approval arrive, verify bounded live AI and isolated APNs/worker behavior; keep production untouched.
4. Obtain both-phone/design acceptance of the already-available build17; batch further candidates only when verified changes justify them. Prepare a concrete release/cutover package only after all remaining gates pass.

No new automation was created. No service purchase, production mutation/migration, old-app retirement, public release or merge occurred during these increments.

## Earlier chore and routine verification

The reschedule/archive conflict, date boundary and retained lifecycle evidence is preserved in [the 5 October history](progress-history-2026-10-05.md). Later checkpoints below supersede their pending states.

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

The bounded native PDF picker/upload recovery checkpoint and its verification limits are preserved in [the dated history](progress-history-2026-10-05.md#native-pdf-receipt-picker).

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

## Private variable bill consent (5 October 2026)

Actual owned rendering exposed20.5pt review/decline buttons inside the timed
approval section. Enlarging them exposed the Form row triggering both actions;
the first candidate wrongly opened Decline from Review, with no decision staged.
The corrected section separates borderless buttons, uses44pt interactive labels
and a native alert with explicit Cancel. Normal/largest/dark Review/Cancel and
separate Decline/Cancel corners select only the intended branch and stage nothing.
All1,041 native inputs match the Mac; strict formatting/source limits, signing
and seven focused native approval/preflight/account/recovery methods pass with
zero failures/skips after the final correction.
One clearly synthetic authenticated AI-journal tool invocation creates an
owner-private pending bill proposal without posting money; its turn is honestly
interrupted, with no fabricated model answer. Actual partner/outsider403 and
anonymous401 reads/decisions, owner execution-before-consent409 and altered-input400
refusals preserve the same pending proposal and all59 financial events/balances.
Conversation/turn/command RLS yields zero rows for B/outsider, denies anonymous
access and exposes the known rows only to A. This is not live AI verification.
The first proposal expired unused; a fresh synthetic turn targets the same rule.
One largest-text native approval posts exactly3centimes, A2/B1 split, deriving
A+1/B−1 with all59 earlier events exact. Actual restart/native recovery/detail
navigation and one known-operation replay preserve the identical consumed receipt
without reposting. Ordinary B1-cent settlement restores zero balances and retains
all61 events; only the new rule is paused. Raw original59 financial/allocation/ledger
and claimed Storage metadata hashes stay exact. Owner-private consumed approval,
shared expense visibility, normal native Done/zero balance/ordinary Today and64
empty journals pass. The direct-Save receipt probe correctly returns400 for an
AI operation; the verifier uses the private approval envelope. No save was repeated.
[Evidence](../evidence/2026-10-05/swiftui-private-variable-bill/README.md) separates
candidate failures, synthetic command proof and actual native/hosted execution.
Final source36e6fb73 passes Nest37241219456 and SwiftUI37241219530:491 Foundation/41
explicit skips,409 signed-native/11 explicit skips, zero failures, strict format/limits
and actual signing. All seven focused bill-approval methods pass without skips.
First-candidate native CI was automatically superseded/cancelled, not passed.
Other timed financial consent rows need the same isolation/cancellation audit;
hosted lost-reply/declined variants, VoiceOver/races/both phones/live AI stay open.
Documentation checkpoint21550910 passes Nest37238842339. No beta/merge occurs; M7 remains open.

## Earlier financial consent verification

The six-family isolation, explicit cancellation and preserved61-event baseline are recorded in [the 5 October history](progress-history-2026-10-05.md#financial-consent-row-isolation) and [source evidence](../evidence/2026-10-05/swiftui-financial-consent-controls/README.md). The later readability checks below supersede its clipped-message and navigation-observer findings.

## Earlier financial readability verification

The compact financial alerts and final resumption-title proof, exact source CI and preserved61-event baseline are recorded in [the 5 October history](progress-history-2026-10-05.md#readable-financial-confirmations). All original evidence remains linked there.

## Native preferences input and reload controls — 5 October

The verified preference controls and exact CI evidence are retained in the
[5 October archive](progress-history-2026-10-05.md#native-preferences-input-and-reload-controls--5-october)
and [native evidence](../evidence/2026-10-05/swiftui-preferences-input-reload/README.md).
Whole cooking-keyboard readability and broader accessibility/phone/live-AI gates stay open.

## Earlier private-memory consent

Original save/edit/decline/removal and approval/receipt RLS checkpoints remain in [the 5 October history](progress-history-2026-10-05.md).

## Fresh private-memory consent and terminal recovery

Source `d96b9678` fixes the demonstrated token-only consent defect: two native
regression methods fail38 assertions before the fix. Eight focused Foundation
and eight signed-native methods pass, retaining lost-reply/account-switch checks.
New consent needs a fresh exact online approval; canonical reload changes only
the same confirmed proposal. Explicit terminal/expired dismissal preserves
uncertain decisions and their exact retry command. Follow-up `d6189131` also
updates the open view at expiry without changing rows or sending a command.
Both commits pass their own routine/native CI; latest Nest37261862852 and
SwiftUI37261862814 pass:496 Foundation/41 skips,415 native/11 skips,0 failures,
strict format/limits/signing. A real1000-character native Paste/Review matches
the private test-API proposal. Keyboard watchdogs,512-character observer bounds
and the obsolete pre-expiry Save search remain honestly recorded. Actual held-open
expiry, cold restart and one largest-text44pt corner Discard preserve approval
history, both empty memory lists and exact full61-event finances/zero balances.
All1,043 final inputs match. [Evidence](../evidence/2026-10-05/swiftui-memory-consent-preflight/README.md).
Ordinary Today/default text/light/64 empty journals/data/Keychain restoration passes.
VoiceOver/two clients/phones/live Gateway and M1–M9 acceptance remain open.
Build16/PR85/provider gates are unchanged; no inference, beta, production action,
source merge, purchase or automation occurred.

The retained shopping audit is preserved in [the dated history](progress-history-2026-10-05.md#retained-shopping-authorization).

The bounded cooking-editor keyboard fix and complete native/routine CI are
preserved in [the dated history](progress-history-2026-10-05.md#cooking-notes-keyboard-readability).

The keyboard-safe private composer and exact full native/routine CI are preserved
in [the dated history](progress-history-2026-10-05.md#private-composer-keyboard).

The92-case retained calendar-sync audit, hosted read-only matches and passing
routine CI are preserved in [the dated history](progress-history-2026-10-05.md#retained-calendar-sync-authorization).
The older count is superseded by the unique inventory below; broader M9 stays open.

The98-case retained financial-context/opening audit and passing source CI are
preserved in [the dated history](progress-history-2026-10-05.md#retained-financial-context-and-opening-balances).
Its inventory count is superseded below; full acceptance remains open.

The144-case retained recurring audit and passing CI are [in the dated history](progress-history-2026-10-05.md#retained-recurring-command-boundaries).

The retained notification privacy fix and127-case verification with passing source CI are [in the dated history](progress-history-2026-10-05.md#retained-notification-privacy-and-device-boundaries).

The130-case retained excluded-feature check and passing source CI are
[in the dated history](progress-history-2026-10-05.md#retained-excluded-feature-command-boundaries).

## Retained public invoker reads and option revisions

The two public invokers pass53 full-chain cases:31 refusals/22 flows. A real retained renewal-date underflow crashed attention reads; the pure private helper fixes calculation only, preserving all rows/public grants in nest-test.
Four database tests pass2,928 arithmetic cases; the307-migration rehearsal preserves complete finance/excluded/renewal state. Both hosted members see the two valid synthetic renewals; an outsider sees none. Rollback restores all20 fingerprints, including61 financial events.
Three bodies/client grants/configs match; the existing trusted-service archive grant differs from standalone defaults and is recorded. Fresh advisors add no findings. [Evidence](../evidence/2026-10-05/legacy-invoker-boundaries/README.md).
Scoped checks and routine CI37295749488 pass source `40d01132`, including four focused database tests. The public inventory has60 definers/2 invokers with bounded evidence; private/table/Storage/service/external-writer and cutover acceptance remain.
Live AI billing, worker/APNs, both phones and full M1–M9 stay open. No release, production, purchase or merge.

## Native accessibility diagnostics and Calendar readability

The signed smallest SE3/real test API now has a separate manually selected
`NestAccessibility` XCUITest scheme. Routine CI only formats/limits these sources;
its default Nest scheme remains unchanged. Six Calendar headers use explicit Quiet
ink/semantic heading type; the list uses semantic body text. The initial permission
heading's contrast warning disappears, but the nearby partner heading still fails.
All639 compiled app/test/project inputs match Linux and the authorized Mac.

Actual normal/light and largest/dark permission reading pass with every full
paragraph revealed above the floating bar and a minimum44pt access target. The
explanation grows94.5→465.5pt, Full Access copy68→378.5pt and button52→217.5pt.
Native screenshots and bounds agree. Corrected lazy-row/scroll observers were
necessary; no permission grant or household command occurred. All64 saved-command
slots remain empty, original large/light/stable test origins/push-disabled settings
are restored and actual signing/preserved Keychain are verified.

The full five-test audit **fails with20 reported findings**, zero suppressed;
Calendar warnings are duplicated across two tests. Dynamic Type, clipped copy and
contrast near/beneath the bar or with nil elements remain investigated but open.
A stronger scroll-edge treatment remained failing and was removed. Focused
reading success does not close the audit, VoiceOver, phones or M1/M6/M9.
Local formatting/Oxlint/source limits pass. Both exact-source workflows pass
`039b62b0`: Nest37298961797/SwiftUI37298961716,496 Foundation tests/41 explicit skips,
418 signed app tests/11 explicit skips, zero failures and actual signing. CI does
not run or certify the separate failing full accessibility audit.
[Evidence](../evidence/2026-10-05/swiftui-accessibility-audit/README.md).
Build17 remains the private candidate; no beta/model/worker/production/merge occurred.
