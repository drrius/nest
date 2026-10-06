# Nest progress

Updated 6 October 2026. **The goal is active and incomplete. M0’s native-execution foundation gate is verified; M1–M9 acceptance gates remain open.** [ADR0002](adr/0002-swiftui-client.md) makes SwiftUI authoritative; Expo/RN client code and dependencies are removed. The Effect v4/Vercel AI SDK backend, financial/privacy rules and approved Quiet design remain in force.

Source work is on Linux, `/home/drrius/Work/nest`; owned Xcode/simulator work uses the isolated `/private/tmp/nest-current-qa-82a` mirror on the Mac; the original `/Users/dariussibarium/Developer/nest-swiftui` mirror is preserved. Native CI is separate from that owned simulator. The full prior log is preserved in [dated evidence](progress-history-2026-10-01.md); its old build numbers and pending states are historical.

## Available candidate and current source

**Latest private candidate: SwiftUI0.1.0/build18**, exacte7926c89. Both exact-source CI workflows, signed Mac archive/export/package/source audits and the supported Apple21:22:43 UTC VALID/IN_BETA_TESTING/unexpired check pass. [Release evidence](../evidence/2026-10-05/swiftui-build18-layout/README.md). Next owner action: update Nest to18 in TestFlight and try the [short phone layout pass](native-rewrite/build18-first-phone-pass.md). Partner access, installation and phone/design acceptance remain unverified. Live AI, scheduled posting/reminders and push stay inactive; production is untouched.

Build18 includes the shared four-tab header/20pt side/14pt top insets and Quiet Calendar cards, auth/draft/recipe fixes since17 and the demonstrated large-text Today grocery shortcut fix. Twelve header captures/24 Profile and assistant links plus twelve post-fix both-member grocery methods pass with restored settings/identities and unchanged retained history. Nest37374014717/SwiftUI37374014748 pass at the signed source:496 Foundation/41 skips,440 signed-native/18 skips, zero failures, format/limits/signing and guarded UI compilation. All1,080 frozen source inputs and copied IPA hash match. Exactly one private submissionfcd756b6-fe07-4356-8346-521c2c6113da finishes, and the spaced Apple check verifies internal availability. Owned temporary signing keychain/certificate/password copies are removed on both hosts; original credentials/search list and the older unpublisheda3 archive remain intact. No cloud build, expanded invitations, purchase, public release or source merge occurred. Full M1–M9 acceptance remains open.

Detailed earlier slice checkpoints, including previous candidate numbers, remain in [the 4 October history](progress-history-2026-10-04.md). Later evidence below supersedes their pending states.

Earlier Calendar reading evidence is preserved in [6 October history](progress-history-2026-10-06.md).

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
upload source b48e6160 passes Nest37313762429/SwiftUI37313762258.

Unchecked means complete acceptance is outstanding, even where implementation and bounded verification exist.

- [x] **M0 — Decisions and native execution.** Approved ADRs/action inventory, source/build/environment identity, repeatable signed local Xcode/native CI execution and internally available build18 installation path are verified. Current source-matched clean signed-out cold launch and real scoped-session four-tab smoke pass. [Criterion-by-criterion audit](../evidence/2026-10-04/swiftui-m0-foundation/README.md). The plan explicitly separates physical permission/calendar/push acceptance; both-phone installation/sign-in remain M3/M6/M8/M9 gates. Full M1–M9 acceptance stays open.
- [ ] **M1 — Quiet native interactions.** Four SwiftUI tabs and real-data surfaces exist, with selected rendered and large-text simulator evidence. The [artwork inventory](native-rewrite/artwork-inventory.md) now audits the single generated-icon source, native symbols and build13 packaging. Full populated/error/keyboard/VoiceOver/Reduce Motion review and owner design acceptance remain.
- [ ] **M2 — Authenticated offline/AI slice.** Keychain, verified sessions, scoped SQLite and limited exact replay are implemented and tested. Private chat, streaming/interruption/cancellation and honest handoffs exist. Live AI still fails Gateway eligibility403; successful live tool/stream behavior and both-member phone/offline acceptance remain.
- [ ] **M3 — Identity, onboarding and settings.** Quick/comprehensive setup, progressive entry, food/cooking/notification preferences and private-memory consent/recovery exist. New online preflight, canonical settings-result links and account/read fences pass CI. Normal-text owned native saves/lost-reply recovery/stale-form refusal and hosted populated-goal privacy pass. Private-memory pending restart, explicit save/edit/decline/removal, populated RLS and non-resurrecting old-consent replay now pass; both-member forms, broader setup/private settings, accessibility and hardware enrollment remain.
- [ ] **M4 — Today, chores and groceries.** Today filters, ordinary/alternating chore commands, handovers, grocery CRUD/checking, exact scoped SQLite retry/conflicts and corresponding AI commands exist. Source/native/property/RLS checks and selected hosted/owned flows pass. Current grocery edit preflight, retained fields, explicit latest-item reload, committed lost-response restart/update/exact retry, precise removed-intent copy/discard and normal/large-text touch targets now pass owned test-API execution with normal cleanup and unchanged money. Earlier checkbox compatibility/opposing-intent cases and grocery→expense switch/back also pass. Both required grocery-source CI workflows pass. Two independent fictional native clients now verify compatible queue/restart/replay, opposing intent/explicit discard and committed lost-reply/exact retry, then normal removal/Today/stable-origin restoration with64 empty journals and six unchanged hosted fingerprints. The49 executions retain46 passes/three observer failures/zero skips; corrected row observation passes, while whole Add is not rerun. The final observer passes Nest37341752813/SwiftUI37341753014 at head2267bfa4:496 Foundation/41 skips,423 signed-native/14 skips, zero failures; CI does not run the hosted pair fixture. [Pair evidence](../evidence/2026-10-05/swiftui-native-grocery-pair/README.md). The later two-native-client chore pass verifies handover accept/decline, lost reply/exact retry, offline/partner completion convergence and normal archive with retained history; broader membership/schedule conflicts, settings/navigation, VoiceOver/haptics/radio loss, both phones and complete daily-use acceptance remain open; full M4 is not closed.
- [ ] **M5 — Meals and planning.** Week/library/recipe CRUD, saved/one-off placement, move/replacement/removal, proposals, ingredients and preparation exist. A manual seven-day saved-recipe cycle, preparation and replacement have bounded real native/two-member evidence with normal cleanup. Varied portions/partner constraints, live generation/replacement and full phone/UI acceptance remain.
- [ ] **M6 — Read-only Calendar.** EventKit, permission/selection, agenda/layers and explicit numeric-only busy sharing exist. Selected real timed/all-day/DST, both-member sharing, outsider denial and online cleanup pass; durable offline removal and races have focused tests. Hardware offline/reconnection, long background periods, complex calendars and full accessibility/privacy journeys remain. Personal event text stays on-device.
- [ ] **M7 — Money.** Native balance/history/detail, financial commands/private approvals, receipt storage, recurring controls/variable bills and exact recovery exist over append-only CHF-centime history. Selected arithmetic/isolation/lost-response/hosted checks pass. Pause/cancel proposal review and exact recovery pass focused native CI; resumption proposal review/recovery passes current-source native CI; variable-cycle proposal review/decision/recovery is implemented with local wire/database checks and exact-source Foundation/native/routine CI passing; manual-cycle selection/review/command recovery passes local checks and exact-source Foundation/native/routine CI; private manual-cycle approvals and retained legacy inventory/draft history pass exact-source native/routine CI. Direct legacy dismissal passes local checks and exact-source native/routine CI; its original-term review/navigation/alert cancellation now pass owned rendering. Private dismissal approval/withdrawal passes local and exact-source native/routine CI; original-term review/navigation/alert cancellation now pass owned rendering. Actual rendered recovery states and full phone journeys remain pending. Direct draft-to-expense confirmation now has native source and focused Mac/database verification; both required workflows and actual fictional keyboard/review/cancel rendering pass at direct-confirmation source `4759e124`. Private confirmation review/recovery now has native source with focused Mac/backend and actual fictional alert verification; both focused native offline discovery/isolation checks pass; exact-source CI passes at `886773cc` (463 Foundation/41 explicit skips and344 signed-native/nine explicit skips, zero failures). Direct rule adoption source `e3e6b1ef` now has explicit fresh terms, prospective coverage/member/day preflight and exact recovery; focused Mac/backend and actual fictional variable-form checks pass. Nest37142967731 passes and SwiftUI37142967820 also passes:468 Foundation/41 explicit skips and357 signed-native/10 explicit skips, zero failures, strict formatting/source limits and actual signing. Private adoption now has source and focused Mac/backend/fictional-form verification; native CI at `1151caad` and corrected routine CI at `83a5a015` pass; hosted/provider/phone acceptance and recovery rendering remain pending. [Source coverage](native-rewrite/action-inventory.md#swiftui-financial-approval-coverage-1-october-2026) records the exact gaps. Ordinary expense/settlement and refund/correction staging now require fresh scoped domain reads before new intent; both slices pass exact-source Foundation/native and routine CI. Recurring create/edit/state/resume/variable staging now has fresh membership/revision/server-day/uncovered-cycle checks,23 focused local integration cases passing and exact-source Foundation/native/routine CI passing. Expense/refund/correction/settlement/rule approval staging now has fresh exact private pending/unexpired reads, with all six new native cases and ten existing exact-recovery cases passing current-source CI; existing account checks and later online retries do not prove that offline initiation is blocked. All approval/recurring variants, full history reconciliation and native/two-phone acceptance remain. Production posting is inactive.
- [ ] **M8 — Renewals, reminders and push.** Renewal CRUD, recipient reminder editors, saved summaries, direct APNs transport, registration/outcomes, bounded worker and protected routes exist with fixture/native/selected hosted evidence. Wider linked/pagination/conflict cases, populated summaries, provider credentials, worker activation, real hardware enrollment and all six delivery kinds on both phones remain. Push is disabled in the current build18.
- [ ] **M9 — Migration and release rehearsal.** Safe synthetic reconciliation/recovery exists; the latest54-legacy/251-native fixture passes with explicit infrastructure exclusions. Local signed binary/internal TestFlight packaging passes. Hosted current-chain reconciliation, external-writer/old-intent drainage, final release source and both-member usability remain. Production cutover, old-app retirement, purchases and public release are separately gated.

## Latest native receipt recovery

The actual native Photos picker now uploads an audited synthetic fixture to private nest-test Storage. Its exact1,476 normalized JPEG bytes/hash match independent uploader reads; partner, outsider and anonymous requests are denied while unposted. The same native reservation/bytes survive restart and a signed client update. One native Remove deletes only this object, with a deliberately lost reply retaining the scoped cleanup intent; reopening emits no write. Two explicit largest-text corner retries return the same deletion result, one also losing its reply, then normally clear the slot. A misleading smaller-photo error is corrected to removal-specific guidance. Nine focused Foundation/three signed native tests pass with no failures/skips, strict formatting/source limits and1,039-input matching. Both full52-event histories/balances and the existing claimed receipt remain intact; pending inventories are restored. Ordinary Today/stable signed test origins, empty31+7+receipt slots, preserved data/Keychain and owned relay/key teardown pass. [Evidence](../evidence/2026-10-04/swiftui-native-receipt-recovery/README.md). Exact source `a0458304` now passes Nest37195153704/SwiftUI37195153685:490 Foundation cases/41 explicit skips and409 signed-native cases/11 explicit skips, zero failures, strict format/limits and actual signing. The existing claimed receipt also renders through native history/detail/browser navigation and returns to the same entry; both complete histories/Storage remain unchanged. [Viewer evidence](../evidence/2026-10-04/swiftui-claimed-receipt-viewer/README.md) records corrected offscreen/close-icon observer assumptions without repeated opens or signed-URL exports. The later PDF checkpoint above supersedes picking/upload/removal; independently downloaded PDF bytes, new posted attachments, partner native viewing, full accessibility, live AI handoff and both phones remain open. No expense, beta, production action or merge occurred; M7 remains incomplete.

## Earlier verification

Earlier source-specific test totals and result-link checks are preserved in [the 5 October history](progress-history-2026-10-05.md).

## Exact blockers and owner inputs

- **Native QA:** bounded grocery, receipt/history and ordinary expense recovery checks pass. The two-client chore pass verifies one native creation, committed lost-reply handover/exact retry, sender403, recipient accept/decline, offline restart and partner completion convergence, one current/preview and original rotation, then ordinary archive. Setup has ten passes; handover30 passes; completion12 executions retain11 passes/one archived-list observer failure, followed by four successful read-only corrected checks. Both clients finish on Today/stable test origins with64 empty journals. Relays/private keys/configs are removed; all original chore/activity rows, finance and Storage remain exact. Native Done/Return keyboard-source b4dd8494 passes Nest37348042463/SwiftUI37348042498:496 Foundation/41 skips,425 signed-app/16 skips, zero failures, format/limits/signing and guarded UI compilation. The archived-list assertion correction f9ec8792 also passes Nest37350253862/SwiftUI37350254016 with those same counts and gates. CI does not execute hosted pair actions. [Native pair evidence](../evidence/2026-10-05/swiftui-native-chore-pair/README.md) preserves earlier failures and exact gaps. Broader financial/meal/settings/membership conflicts, full accessibility, physical radio loss and both phones remain open; M4 is not closed.

- **AI eligibility:** the last real Swift/provider checks returned Gateway403 `customer_verification_required`; credits/usage0/0. Owner: check the existing valid card on [drrius-projects billing](https://vercel.com/drrius-projects/~/settings/billing), finish any verification prompt and report the changed eligibility. No credits purchase/upgrade is requested. Existing project-only USD1 nonrefreshing cap stays unchanged; then perform one bounded live recheck. The CHF20/month ceiling remains.
- **Legacy completion boundary:** a direct legacy RPC could write a future completion date. New commands now reject future/nonfinite/unsupported dates while preserving historical exact replies. Seven focused database tests and the304-migration rehearsal pass, including21 document/profile/completion-photo/date probes and existing real database AI/epoch dispatch. Manifest55/250 and all four manifest tests pass. Applied only to nest-test (hosted20261004144314): exact body/ACLs, ten real Auth/PostgREST negative probes and unchanged complete finance/attachments/routine history pass. Routine37210225147 and Deep37210426388 pass exact source c5469baf (23 core,50 conflicts,1,235 database/RLS, zero failures/skips). No new native execution claimed;49 other legacy public functions/deeper private paths remain. [Evidence](../evidence/2026-10-04/legacy-completion-date-boundaries/README.md). Prior receipt cleanup checkpoint1d67f235 now passes Nest37208513631. M9 stays open.
- **Receipt cleanup:** two retained legacy cleanup RPCs could invalidate another member's old private native receipt intent. The uploader guard now passes17 focused database tests and the303-migration disposable rehearsal, with16 new attachment boundary probes and exact retained finance/receipt reconciliation. Applied only to `nest-test`: hosted bodies/ACLs match, all52 financial events plus allocation/ledger/upload/intent/Storage digests stay unchanged. Source956cd927 routine CI37207407493 caught the omitted migration checksum entry; it is corrected and four local manifest tests pass. Corrected source3b141cc5 passes routine CI37207727428; deep37207534599 passes unchanged SQL/tests with23 core,50 conflicts and1,231 database/RLS cases, zero failures/skips. [Evidence](../evidence/2026-10-04/legacy-receipt-cleanup/README.md). Existing81 privileged-function warnings remain; ten legacy public RPCs now have bounded reviews, with50 others/deeper private paths open. M9 stays open.
- **Test API:** preview `nest-test-kjn4mw4di-drrius-projects.vercel.app`, backend source `83a5a015`, is READY and now serves the already-authorized stable test API alias. Seventeen read-only checks pass on the preview and again on the stable address: both members see the expected test household, an outsider gets403, anonymous money access gets401 and the recurring worker returns404 while disabled. Existing preview configuration was reused; no server secret was transferred, scheduler activated, financial write/model call sent or production data touched. Hosted populated legacy/approval/provider journeys remain unverified.

- **Worker credential transfer:** automatic approval review rejected exporting the test Supabase server key and scheduler token to Vercel because prior test-deployment authorization did not explicitly cover that transfer. A specific owner approval question is already pending. No transfer, alternate path, schedules or worker activation occurred.
- **APNs:** server-side provider `.p8`, key ID/team/configuration, worker activation and real hardware token/enrollment/six-kind delivery on both phones remain needed. App Store Connect signing credentials are not an APNs provider key. Push stays disabled.
- **Phones:** both partners need the identified build18 installation, Apple sign-in and [phone checklist](native-rewrite/swiftui-phone-acceptance.md), followed by complete weekly/financial-approval/offline-conflict/calendar/privacy/accessibility acceptance. Actual partner tester access is still unverified. Pending phone-feedback questions should not be duplicated.
- **Merge:** [PR85](https://github.com/drrius/nest/pull/85) was freshly read on5 October as OPEN/CLEAN and retains the specific recorded automatic-review exception. The Sol waiver does not erase it; no local/main merge bypass. New source is pushed on feature branches with CI.
- **Cutover:** existing-data/current-chain reconciliation and external-writer/old-intent drainage precede any production migration, retirement or public release. Safe fixtures and private testing do not authorize these actions.

## Earlier native and migration checkpoints

Handover, offline reads, retained confirmations, preferences and manual-meal checkpoints are retained in [5 October history](progress-history-2026-10-05.md). Their bounded results do not close the milestone gates.

## Broader privileged-function source parity and bounded legacy guards

Fresh hosted reads and a disposable302-migration compilation now match all221 authenticated privileged function bodies (81 public/140 private), plus the delegated calendar-lease helper:222 exact-signature body matches. This is provenance, not a semantic safety claim. Seven legacy public access paths now have an actual guard trace,36 two-tenant/unauthorized/lease/rollback SQL checks in the populated rehearsal and eight actual hosted read-only probes. Search and Storage metadata usage remain tenant bound; known connections/tokens do not authorize another household; expired/mismatched/reentrant leases and foreign event IDs are rejected. Authorized partner calls succeed in rolled-back fixtures. Original calendar/Storage metadata/tenancy and full financial/receipt reconciliation remain unchanged. Fixture reservation/output errors were corrected without bypassing the real trigger; only the final complete run counts. [Evidence](../evidence/2026-10-04/legacy-privileged-boundaries/README.md). Focused formatting/lint and exact-head Nest37198811574 pass at `c73117e3`; native shipping source is unchanged. The remaining53 legacy public functions, deeper private semantics, real hosted Auth/Storage migration, workers/APNs, signup/provider decisions, external writers and complete M9 remain open. No hosted calendar/Storage/schema mutation, secret transfer, inference, beta, purchase, production action or merge occurred.

## Next work

The four home tabs share one header and20pt side/14pt top insets; Calendar uses Quiet cards. Twelve normal/light, normal/dark and maximum/dark native captures and24 Profile/assistant links match header anchors within0.5pt. All images were reviewed; two unchanged-date picker checks pass. All eight shared-header/root-layout source files still match the available build18 atf98a2658; the four normal/dark images were rechecked on6October. No new simulator run or release is claimed. Actual Calendar selection, full accessibility and phones remain open. [Layout evidence](../evidence/2026-10-05/swiftui-root-layout/README.md).

The manual seven-day week has nine recipe,37 placement/read and eight move/read native checks. Eight ingredient checks retain the saved rice-only choice across navigation and confirm one100g grocery; both members agree. Original groceries/links and14 other retained row sets remain exact. Ingredient source923f1db passes Nest37372405961/SwiftUI37372405933:496 Foundation/41 skips,440 signed-app/18 skips, zero failures, format/limits/signing/UI compilation. The later edit/preparation evidence below supersedes those earlier pending checks; saved-notice readability and the unsuppressed invalid-frame warning remain open. [Meal evidence](../evidence/2026-10-05/swiftui-native-manual-week/README.md), [ingredients](../evidence/2026-10-05/swiftui-native-ingredient-review/README.md).

Both members pass six ordinary grocery-read methods. The maximum/dark check then reproduces an oversized Today grocery shortcut before any action. Accessibility text now gets full card width; decorative icons remain in the ordinary layout. Twelve post-fix native checks pass across normal/light and maximum/dark, with813 matching inputs, unchanged canonical groceries/history, Today/large/light/original actors and64 empty journals each. No grocery action is repeated. Sourcee7926c89 is pushed; Nest37374014717 and SwiftUI37374014748 both pass:496 Foundation/41 skips,440 signed-app/18 skips, zero failures, format/limits/signing/guarded UI compilation. [Readback and retained failure](../evidence/2026-10-05/swiftui-native-grocery-readback/README.md). These focused passes do not close the original20-report accessibility audit.

Private0.1.0/build18 is now internally available. The original signeda3 candidate/native CI pass are preserved; all four routine attempts fail before runner allocation. No further unchanged-source retry is requested. Before its single submission, the candidate was refreshed from exacte7926c89 to include the demonstrated accessibility fix;1,080 frozen source files match before archive/after export. Native signing/package/privacy/test origins/arm64/dSYM checks and copied IPA hash pass; owned temporary credentials are removed. Both current-source CI checks pass. Exactly one authorized submissionfcd756b6-fe07-4356-8346-521c2c6113da reports FINISHED; the first Apple check does not yet list18, then the spaced21:22:43 UTC check verifies VALID/IN_BETA_TESTING/unexpired. Build18 is now internally available; actual phone update/design acceptance remain unverified. [Updated preparation](../evidence/2026-10-05/swiftui-build18-layout/README.md), [original](../evidence/2026-10-05/swiftui-build18/README.md). Live AI, worker/APNs, both-phone acceptance and production cutover gates remain separate; internal availability is verified; actual phone acceptance remains open.

## Native saved-recipe edit verification

Two ordinary SDK accounts agree on the owned recipe and captured week. A real36pt Edit toolbar fails before entering the editor; the row and whole grocery/history checkpoint remain unchanged. Saved-recipe Edit/Archive and editor Cancel/Save now reuse44pt Quiet controls. Selection-menu and delete-character observer failures remain recorded before Save. Six corrected physical-keyboard native probe methods now pass across both accounts, with exact before/after SDK data, restored drafts/Today/large/light/64 empty journals and815 matching inputs. The invalid-frame warning remains unsuppressed. Source7febec81 passes both CI workflows:496 Foundation/41 skips,441 signed-app/19 skips, zero failures, format/limits/signing/UI compilation. Final observer sourcea520f9b5 passes Nest37378907536/SwiftUI37378907490 with the same counts and strict gates. The same host-key-verified Mac continues over LAN after Tailscale SSH times out. Twelve final native methods now pass: one library instruction Save, unchanged week/captured plan for both SDK accounts and both screens, one partner restore, and identical final reads. All six final screenshots are reviewed; only the owned row timestamp and library revision change, with original ingredients/planned snapshot and whole retained-history/grocery checkpoints exact. Both clients return to Today/large/light/original scopes/64 empty journals. Six additional maximum/dark native planned-meal read methods pass, with both fully visible instruction targets reviewed, canonical reads exact and both clients restored. No additional Save is sent. These changes are not in build18. [Evidence](../evidence/2026-10-05/swiftui-native-manual-recipe-edit/README.md).

## Native linked preparation

Twelve real native methods pass for one shared preparation from the owned19 October meal, both-member SDK/rendered reads, one partner instruction/responsibility edit and both-member reads of the same task/occurrence. All six captures are reviewed and817 source inputs match. The first36pt Cancel failure stops before Save;44pt Quiet Cancel/Save labels fix it. Both clients return to Today/large/light/original scopes/64 empty journals. The recipe, captured plan, week/revision and library revision remain exact; all original20 routines/26 occurrences/115 activity rows and other retained history/finance/Storage rows match, as do all30 groceries/six links. One new task/occurrence and two activity records are retained. Source599d1c1a passes routine37381040566; its native run is cancelled by the observer update. Six corrected maximum/dark read-only methods pass with both instruction targets visually reviewed and canonical state exact. The first partner positioning failure remains recorded; measured native drags preserve the full-visibility assertion. Currentf85a7f72 passes Nest37382474658/SwiftUI37382474659:496 Foundation/41 skips,442 signed-app/20 skips, zero failures, format/limits/signing and guarded UI compilation. All817 current inputs match; both clients return to Today/large/light/original scopes/64 empty journals. These changes are not in build18; full accessibility/live AI/phones and task completion/conflict acceptance remain open. [Evidence](../evidence/2026-10-06/swiftui-native-preparation/README.md).

## Native preparation completion

One actual native date Save moves only the owned task to6 October; a later navigation failure is retained and the Save is not repeated. One Today tap records completion by Test Sam. Eleven resumed SDK/UI methods pass: both members see the same completed task and unchanged recipe/captured week, and both finished editors keep date/responsibility fixed. The immediate Today capture is pending; six final read-only methods prove both restarted Today/Everyone views have no open/pending row or sync notice. Both captures are reviewed; current32a8609d matches818 inputs and restores Today/Me + shared/large/light/original roles/64 empty journals. All five captures are reviewed,818 inputs match sourcee7d8fcff, Today/large/light/original roles/64 empty journals are restored, all original retained rows and whole groceries/links stay exact, and the same linked occurrence has one new completion/no successor. Final4bea41bf passes Nest37385375622/SwiftUI37385375630:496 Foundation/41 skips,442 signed-app/20 skips, zero failures and strict native gates. Earlier nativee7d8fcff is cancelled by the observer update; its routine passes. Four observer failures and five separate form-read checks are preserved. [Evidence](../evidence/2026-10-06/swiftui-native-preparation-completion/README.md). Full accessibility/live AI/phones and complete M1–M9 stay open; no new beta, model call, worker, production operation or merge.

## Preparation readability and current audit

Completed status is now plain; untouched Cancel closes directly and edited drafts use explicit native Discard/Keep editing. Fourteen maximum/dark and normal/light both-member native methods pass, all ten images are reviewed,447pt explanation coverage and44pt choices pass, Keep editing preserves local input and Discard saves nothing. All818 inputs, canonical SDK data, original retained rows/whole groceries and Today/large/light/original roles/64 empty journals match. Exact99ca6898 passes Nest37388478606/SwiftUI37388478424:496 Foundation/41 skips,442 signed-app/20 skips, zero failures and strict native gates. Four observer/choice failures remain preserved. [Evidence](../evidence/2026-10-06/swiftui-preparation-readable/README.md). The current five-method root audit fails with19 unsuppressed reports,11 contrast/eight Dynamic Type, replacing the older20 checkpoint; six SDK/restoration checks pass,818 inputs and canonical state match and all five images are reviewed. [Current audit](../evidence/2026-10-06/swiftui-current-accessibility/README.md). Bounded reading does not close these diagnostics, VoiceOver/phones or full M1–M9. No new beta, model call, worker, production operation, purchase or merge.

## Notification draft navigation

A model regression and corrected native before-fix round trip prove unsent choices were reset. The shipping fix preserves drafts and asks before Back/Reload discard, with account clearing and separate durable recovery. Five controlled model/read/account methods pass. The census confirms expected labels/type40 and217.5pt rows; reader failures occur after returning to a lower retained position. Directed upward search fixes them. All eight final native methods pass: four real both-member SDK reads and four normal/light or maximum/dark interaction checks. All eight modal images are inspected, headings/44pt choices fit, and Keep editing/Reload/Discard/reopen retain the intended values. All820 inputs match98629e89; canonical reads, original roles/Today/large/light/64 empty journals and fresh notification/owned/retained/grocery hashes stay exact. Source98629e89 passes Nest37396636862/SwiftUI37396637155; the preceding62dd893f also passes both workflows with496 Foundation/41 skips,443 signed-app/20 skips and zero failures. [Evidence](../evidence/2026-10-06/swiftui-notification-drafts/README.md) retains switch/count/List/return-reader failures and both diagnostics. Full19-report accessibility, VoiceOver, live AI, APNs, phones and M1–M9 remain open. No hosted Save, permission, beta, inference, worker, purchase, production operation or merge; build18 lacks this later fix.

## Meal preference drafts

Food and cooking Back dropped local edits without warning; both original native checks fail at the missing alert. Shared44pt Back/Reload confirmation and tab-return preservation protect valid or invalid drafts. The first eight native methods pass, followed by two expanded normal checks and six corrected maximum/read methods. The interrupted Reload observer is retained. Shipping38cfed7b and observerf98a2658 pass both CI workflows, with496 Foundation/41 skips and443 signed-app/20 skips, zero failures, format/limits/signing/UI compilation. Keyboard QA first stops before typing because iOS combines the calorie-field labels. Five census methods identify it; the corrected lookup then passes all eight final methods: four both-member SDK reads plus normal/light and maximum/dark calorie/cooking-notes interactions. Entering20001 disables Save; cancelled Back retains typed text, explicit discard/reopen restores the empty saved value, and pristine Back shows no discard alert. All822 inputs match5694a7ab; canonical reads, original roles/Today/large/light/64 empty journals and fresh preference/owned/retained/grocery checks remain exact. Sixteen Reload modal images and four representative keyboard images were inspected; all24 are retained. Current5694a7ab passes Nest37402429332/SwiftUI37402429424 with the same496/443 totals and strict native gates. [Evidence](../evidence/2026-10-06/swiftui-meal-preference-drafts/README.md) retains true regressions and reader failures. Broader setup/edit paths, full19-report accessibility/VoiceOver/phones/live AI and M1–M9 remain open. No preference Save, permission, inference, worker, release, purchase, production operation or merge; build18 lacks the later shipping fix.

## Renewal editor navigation

The phone checklist now identifies the available build18, its exact release evidence and the later preparation/notification/food/cooking fixes excluded from that candidate. The preceding keyboard source5694a7ab passes both CI workflows; its496 Foundation/41 skips and443 signed-app/20 skips have zero failures and strict native gates, and docs716c33fb also pass routine CI37403106566. The normal renewal baseline proves a36×36pt Add target; the maximum baseline instead stops at a below-fold Refresh lookup. Both clients restore Today/settings/scopes/64 empty journals and canonical data. Add/Cancel/keyboard Done now have44pt targets, with explicit edited-draft Discard/Keep editing. The reader reveals Refresh first. Normal/maximum untouched and typed-draft checks are running on controller36696; no post-fix pass is claimed. No renewal Save or mutation is attempted. Existing full accessibility/live AI/worker/APNs/phones/M1–M9 gates remain open.

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

The fresh private-memory consent fix, expiry recovery, passing CI and restored native
journeys are preserved in [the late history](progress-history-2026-10-05-late.md#fresh-private-memory-consent-and-terminal-recovery).

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

The full audit and twelve-size reading evidence are preserved in
[the dated history](progress-history-2026-10-05.md#native-accessibility-diagnostics-and-calendar-readability)
and [native evidence](../evidence/2026-10-05/swiftui-accessibility-audit/README.md).
The original full audit has20 unsuppressed reports; focused reading passes do not close it.

Earlier failed Calendar contrast experiments remain in [6 October history](progress-history-2026-10-06.md#focused-calendar-contrast-diagnostics).

## Native posted PDF expense

One CHF0.02 synthetic expense has a claimed640-byte PDF; original61 hashes stay exact. The Money fix passes normal/light and maximum/dark history/detail; native bytes and Apple's browser rendering/dismissal pass. Source2def44b6 passes both required CI workflows (496 Foundation/41 skips,419 signed-native/12 skips, zero failures).
Eight normal sign-out/SDK login/partner Profile/PDF read/sign-out/original-member restoration methods pass with zero failures/skips and787 matching inputs. Both identities download exact bytes;64 journals and six hosted fingerprints stay exact. The earlier replacement beneath an active host reopened A: its precise cause remains unproven. Source8b5d6787 passes Nest37328777598/SwiftUI37328777652; full accessibility/live AI/phones stay open. [Evidence](../evidence/2026-10-05/swiftui-posted-pdf/README.md).

## Financial allocation consistency

The allocation guard passes eight DB tests,792 arithmetic cases,six concurrent retries and310-migration rehearsal. Nest-test20261005140239 retains52 consistent allocation-bearing events among62 total; bodies/private privileges/three deferred triggers/six fingerprints match. Sourcefea47c1a CI passes; native acceptance stays open. [Evidence](../evidence/2026-10-05/financial-allocation-consistency/README.md).

## Native credential refresh ordering

Two controlled late-refresh cases resurrect old Keychain credentials after logout or replace a newly signed-in account. Both fail on old NestAuth; the serialized/request-time auth boundary passes those cases and15 existing native auth/session checks. Actual test-API PDF download/navigation also pass, with789 matching inputs, original actor/Today/large/light/64 empty journals restored and six retained fingerprints exact. [Evidence](../evidence/2026-10-05/swiftui-auth-refresh-ordering/README.md).
This fixes the reproduced single-client credential races, not proof of the earlier multi-client fixture's exact cause. Auth source81964951 passes Nest37330470647/SwiftUI37330470658 (496 Foundation/41 skips,421 signed-native/12 skips, zero failures). Real Apple/natural-expiry/phone journeys and complete M3 acceptance remain open. No production, model call, beta or merge occurred.

### Actual test-provider refresh

The guarded native SDK exchanges one real test-provider refresh (HTTP200), retains both fresh tokens/the same provider session and verifies original membership/reopened Keychain. Actual PDF download/navigation then pass;790 inputs,64 journals, Today/large/light and six retained fingerprints match. Only the copied cached lifetime is forced expired; natural JWT expiry is unverified. Source2f53c64d passes Nest37332265237/SwiftUI37332265139:496 Foundation/41 skips,422 signed-native/13 skips, zero failures. Phones/M3 acceptance stay open. [Evidence](../evidence/2026-10-05/swiftui-auth-refresh-ordering/README.md#actual-test-provider-refresh).

## Native unsent chore drafts

New-chore Back now protects edited unsent drafts with a native Discard draft?/Keep editing alert; untouched forms retain normal navigation and durable-request recovery remains separate. The real before-fix loss is retained. Six preceding alert cases pass; after a copy-only reduction, two final normal/light and maximum/dark edited-draft cases pass with visible alert/heading/button bounds,44pt targets and intact input. Both final images show the complete choices; earlier functional passes with clipped rendering remain failed visual evidence. All799 compiled inputs match, both clients return to Today/large/light/64 empty journals, and ten hosted fingerprints stay exact. Strict Swift format/limits pass. Exact fa5c29a4 passes Nest37354314093/SwiftUI37354314167:496 Foundation/41 skips,425 signed-native/16 skips, zero failures; CI compiles the guarded UI target while manual journeys remain separate. [Evidence](../evidence/2026-10-05/swiftui-chore-draft-navigation/README.md). Full20-report accessibility, other forms, VoiceOver and phones stay open; no model call, beta, production operation, purchase or merge.

## Fresh recipe write checks

New recipe, edit and archive now require a fresh authorized library revision before staging; edit/archive also compare the exact displayed recipe. New-recipe refresh preserves typed input after refusal, and its discard uses the short native alert. Thirteen new native model cases cover unavailable/stale reads, exact content changes, account switches during reads and fresh-context recovery; nine existing lost-reply/account/conflict cases remain. Edit Refresh preserves typed changes when the recipe itself is unchanged and refuses automatic rebasing over a changed recipe. Source limits/diff checks pass; initial29ee1515 Swift format/Foundation and routine CI pass; its native step was cancelled by the source update, so it proves no native pass/failure. Exact8e711d65 passes Nest37357189945/SwiftUI37357190102; recipe-toolbar source606f77b5 also passes Nest37361685211/SwiftUI37361685407:496 Foundation/41 skips,438 signed-app/16 skips, zero failures, format/limits/signing and UI compilation. The Mac is reachable. Actual library navigation passes; edited-draft checks expose36pt toolbar controls, then floating-point and offscreen-field observer failures. The shipping toolbar is now44pt. Corrected normal/max preservation/discard checks pass (six typed fields/default servings, visible complete alerts, Today,64 empty journals and restored settings); all four earlier target/observer failures remain recorded. Rendered refusal/refresh remains unverified; the later recipe/placement/move/ingredient evidence above verifies the bounded manual week. The original read-only [manual-week baseline](../evidence/2026-10-05/swiftui-native-manual-week/README.md) reserved an empty19 October week before owned creation and retained original row hashes/identities. No hosted write, model call, beta, purchase, production or merge occurred at that preflight checkpoint. [Verification scope](../evidence/2026-10-05/swiftui-recipe-write-preflight/README.md).
