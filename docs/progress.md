# Nest progress

Updated 7 October 2026. **The goal is active and incomplete. M0’s native-execution foundation gate is verified; M1–M9 acceptance gates remain open.** [ADR0002](adr/0002-swiftui-client.md) makes SwiftUI authoritative; Expo/RN client code and dependencies are removed. The Effect v4/Vercel AI SDK backend, financial/privacy rules and approved Quiet design remain in force.

Source work is on Linux, `/home/drrius/Work/nest`; owned Xcode/simulator work uses the isolated `/private/tmp/nest-current-qa-82a` mirror on the Mac; the original `/Users/dariussibarium/Developer/nest-swiftui` mirror is preserved. Native CI is separate from that owned simulator. The full prior log is preserved in [dated evidence](progress-history-2026-10-01.md); its old build numbers and pending states are historical.

Expense and replacement-expense correction approval screens now read exact
category names through the tenant-scoped API. Missing/unavailable metadata is
explicit; Approve is disabled while Decline and saved-result recovery remain
available. These changes are later than build19. Five focused Foundation
category/expense tests, one correction test, two disposable SDK/approval integration
cases and signed simulator compilation pass. Integration adapters are test-only;
they do not establish native UI or live-provider execution.

Three source-matched native methods also pass on the fictional SE3 clients:
Alex reviews Home and cancels the decline confirmation; Sam sees no owner-private
pending proposal; Alex explicitly declines once, reads the no-expense result and
uses Done. The server retains that proposal as denied with null consumption. The
one decline budget is consumed. Eight protected fingerprints including all62
financial events remain exact; both controllers restore original scopes,64 empty
journals, settings and device-only local choices. Fixture setup used the audited
private command with fixture auth claims, not model generation or auth proof.
[Category review evidence](../evidence/2026-10-07/swiftui-expense-approval-category/README.md).

Category preflight now also belongs to the shared native decision commands, before
durable expense/correction approval staging. Missing/offline/foreign metadata
refuses approval; decline and existing saved-result recovery stay available.
Eight focused signed-app methods pass without skips, including ten new category
cases with real isolated SQLite journals. Two setup/fixture failures are retained;
the successful run corrects only target selection and synthetic wire timestamps.
Rendered category outage/retry and latest-source CI remain open.
[Preflight evidence](../evidence/2026-10-07/swiftui-financial-category-preflight/README.md).

The new category network boundary now also passes delayed-reply/account-switch
checks for expense and correction. Old-account replies fail signedOut and cannot
stage either decision for the new account. Twelve category cases pass as two
signed-app methods without skips on a separate owned simulator; it is shut down
afterward and both preserved QA app origins remain correct. This is native
session/SQLite evidence, not rendered or physical-phone account switching.

The remaining manual-link rendering preflight finds no eligible current fixture:
the retained manual rule is paused with next due11 October, the active reminder
rule starts1 November, and no recurring.link-cycle approval exists. No rule is
activated/backdated and no consumed history is rewritten. One read-only inventory
query initially used nonexistent created_at, then succeeds ordered by id. This
privileged inventory is fixture eligibility evidence only. The pending-review
integration test title is corrected to identify its test-only protocol adapter;
it must not be reported as native UI or real model generation.

Money's unstyled root Sections now use the shared Quiet cards for Bills and
approvals and saved changes. A real normal-size Alex simulator method passes
40pt action inset measurement, visible44pt target, private-list navigation and
return. Signed compile/format/limits pass; both original scopes,64 empty journals,
settings/local selections restore. Maximum text/full accessibility/disclosure and
phone acceptance remain; this is later than build19 and current CI is pending.
[Money grouping evidence](../evidence/2026-10-07/swiftui-money-root-grouping/README.md).

Money grouping also passes one largest-text/dark disclosure check: matching40pt
action insets, complete44pt approvals and three saved-change links, real expansion
and collapse. Original scopes/64 journals/settings/local choices restore. Images
are inspected, but this target coverage is not whole-page readability or VoiceOver.
Routine37576713440 passes shippinge01129db; its native CI remains pending.

Root card inner padding is now one20pt QuietTabLayout value. Today cards move
from18pt and meal-day horizontal content from16pt to the same20pt already used by
Calendar/Money. A real normal-size Today meal-card method passes40pt action
alignment, full44pt target, Meals navigation and return; signed compile passes and
both original scopes/64 journals/settings/local choices restore. Conditional cards,
largest-text meal-day width, full accessibility and phones remain unverified.
[Shared inset evidence](../evidence/2026-10-07/swiftui-shared-card-insets/README.md).

The shared meal-card width now also passes an actual largest-text/dark empty-slot
check:40pt content bounds, complete44pt target, Add meal and native Cancel without
Save. The slot remains empty and both scopes/64 journals/settings/local choices
restore. Populated recipe rows, conditional Today cards and phones remain open.

Earlier expense/refund/correction/recurring setup/cancellation/resumption consent
and largest-text checks remain valid within their recorded scope; do not repeat
those decisions or call those whole families untested. The new category behavior
still needs metadata failure/retry and correction-category rendering evidence.
Full settlement/manual-cycle/legacy rendering, hosted uncertain replies/races,
VoiceOver, both phones and live AI remain open. [Earlier consent evidence](../evidence/2026-10-05/swiftui-financial-consent-controls/README.md).

## Available candidate and current source

**Latest private candidate: SwiftUI0.1.0/build19**, exact `484e5feb`. Candidate routine CI and identical-native-source CI, signed Mac archive/export/package/source audits and Apple VALID/IN_BETA_TESTING/unexpired checks pass. [Release evidence](../evidence/2026-10-06/swiftui-build19/README.md). Update Nest to19 in TestFlight and try the [short phone pass](native-rewrite/build19-first-phone-pass.md). Partner access, installation and phone/design acceptance remain unverified. Live AI, scheduled posting/reminders and push stay inactive; production is untouched.

The preceding build18 includes the shared four-tab header/20pt side/14pt top insets and Quiet Calendar cards, auth/draft/recipe fixes since17 and the demonstrated large-text Today grocery shortcut fix. Twelve header captures/24 Profile and assistant links plus twelve post-fix both-member grocery methods pass with restored settings/identities and unchanged retained history. Nest37374014717/SwiftUI37374014748 pass at the signed source:496 Foundation/41 skips,440 signed-native/18 skips, zero failures, format/limits/signing and guarded UI compilation. All1,080 frozen source inputs and copied IPA hash match. Exactly one private submissionfcd756b6-fe07-4356-8346-521c2c6113da finishes, and the spaced Apple check verifies internal availability. Owned temporary signing keychain/certificate/password copies are removed on both hosts; original credentials/search list and the older unpublisheda3 archive remain intact. No cloud build, expanded invitations, purchase, public release or source merge occurred. Full M1–M9 acceptance remains open.

## Milestone checklist

Unchecked means complete acceptance is outstanding, even where implementation and bounded verification exist.

- [x] **M0 — Decisions and native execution.** Approved ADRs/action inventory, source/build/environment identity, repeatable signed local Xcode/native CI execution and internally available build18 installation path are verified. Current source-matched clean signed-out cold launch and real scoped-session four-tab smoke pass. [Criterion-by-criterion audit](../evidence/2026-10-04/swiftui-m0-foundation/README.md). The plan explicitly separates physical permission/calendar/push acceptance; both-phone installation/sign-in remain M3/M6/M8/M9 gates. Full M1–M9 acceptance stays open.
- [ ] **M1 — Quiet native interactions.** Four SwiftUI tabs and real-data surfaces exist, with selected rendered and large-text simulator evidence. The [artwork inventory](native-rewrite/artwork-inventory.md) now audits the single generated-icon source, native symbols and build13 packaging. Full populated/error/keyboard/VoiceOver/Reduce Motion review and owner design acceptance remain.
- [ ] **M2 — Authenticated offline/AI slice.** Keychain, verified sessions, scoped SQLite and limited exact replay are implemented and tested. Private chat, streaming/interruption/cancellation and honest handoffs exist. Live AI still fails Gateway eligibility403; successful live tool/stream behavior and both-member phone/offline acceptance remain.
- [ ] **M3 — Identity, onboarding and settings.** Quick/comprehensive setup, progressive entry, food/cooking/notification preferences and private-memory consent/recovery exist. New online preflight, canonical settings-result links and account/read fences pass CI. Normal-text owned native saves/lost-reply recovery/stale-form refusal and hosted populated-goal privacy pass. Private-memory pending restart, explicit save/edit/decline/removal, populated RLS and non-resurrecting old-consent replay now pass; Both-member unsaved portion forms now pass normal/maximal text with exact saved-profile isolation; broader setup/private settings, saved variants, accessibility and hardware enrollment remain.
- [ ] **M4 — Today, chores and groceries.** Today filters, ordinary/alternating chore commands, handovers, grocery CRUD/checking, exact scoped SQLite retry/conflicts and corresponding AI commands exist. Source/native/property/RLS checks and selected hosted/owned flows pass. Current grocery edit preflight, retained fields, explicit latest-item reload, committed lost-response restart/update/exact retry, precise removed-intent copy/discard and normal/large-text touch targets now pass owned test-API execution with normal cleanup and unchanged money. Earlier checkbox compatibility/opposing-intent cases and grocery→expense switch/back also pass. Both required grocery-source CI workflows pass. Two independent fictional native clients now verify compatible queue/restart/replay, opposing intent/explicit discard and committed lost-reply/exact retry, then normal removal/Today/stable-origin restoration with64 empty journals and six unchanged hosted fingerprints. The49 executions retain46 passes/three observer failures/zero skips; corrected row observation passes, while whole Add is not rerun. The final observer passes Nest37341752813/SwiftUI37341753014 at head2267bfa4:496 Foundation/41 skips,423 signed-native/14 skips, zero failures; CI does not run the hosted pair fixture. [Pair evidence](../evidence/2026-10-05/swiftui-native-grocery-pair/README.md). The later two-native-client chore pass verifies handover accept/decline, lost reply/exact retry, offline/partner completion convergence and normal archive with retained history; broader membership/schedule conflicts, settings/navigation, VoiceOver/haptics/radio loss, both phones and complete daily-use acceptance remain open; full M4 is not closed.
- [ ] **M5 — Meals and planning.** Week/library/recipe CRUD, saved/one-off placement, move/replacement/removal, proposals, ingredients and preparation exist. A manual seven-day saved-recipe cycle, preparation, replacement and cross-week leftovers copy/read/removal have bounded real native/two-member evidence with normal cleanup. Both-member unsaved varied portions/discard pass normal/maximal text; saved varied portions/partner planning, live generation/replacement and full phone/UI acceptance remain.
- [ ] **M6 — Read-only Calendar.** EventKit, permission/selection, agenda/layers and explicit numeric-only busy sharing exist. Selected real timed/all-day/DST, both-member sharing, outsider denial and online cleanup pass; durable offline removal and races have focused tests. Hardware offline/reconnection, long background periods, complex calendars and full accessibility/privacy journeys remain. Personal event text stays on-device.
- [ ] **M7 — Money.** Native balance/history/detail, financial commands/private approvals, receipt storage, recurring controls/variable bills and exact recovery exist over append-only CHF-centime history. Selected arithmetic/isolation/lost-response/hosted checks pass. Pause/cancel proposal review and exact recovery pass focused native CI; resumption proposal review/recovery passes current-source native CI; variable-cycle proposal review/decision/recovery is implemented with local wire/database checks and exact-source Foundation/native/routine CI passing; manual-cycle selection/review/command recovery passes local checks and exact-source Foundation/native/routine CI; private manual-cycle approvals and retained legacy inventory/draft history pass exact-source native/routine CI. Direct legacy dismissal passes local checks and exact-source native/routine CI; its original-term review/navigation/alert cancellation now pass owned rendering. Private dismissal approval/withdrawal passes local and exact-source native/routine CI; original-term review/navigation/alert cancellation now pass owned rendering. Actual rendered recovery states and full phone journeys remain pending. Direct draft-to-expense confirmation now has native source and focused Mac/database verification; both required workflows and actual fictional keyboard/review/cancel rendering pass at direct-confirmation source `4759e124`. Private confirmation review/recovery now has native source with focused Mac/backend and actual fictional alert verification; both focused native offline discovery/isolation checks pass; exact-source CI passes at `886773cc` (463 Foundation/41 explicit skips and344 signed-native/nine explicit skips, zero failures). Direct rule adoption source `e3e6b1ef` now has explicit fresh terms, prospective coverage/member/day preflight and exact recovery; focused Mac/backend and actual fictional variable-form checks pass. Nest37142967731 passes and SwiftUI37142967820 also passes:468 Foundation/41 explicit skips and357 signed-native/10 explicit skips, zero failures, strict formatting/source limits and actual signing. Private adoption now has source and focused Mac/backend/fictional-form verification; native CI at `1151caad` and corrected routine CI at `83a5a015` pass; hosted/provider/phone acceptance and recovery rendering remain pending. [Source coverage](native-rewrite/action-inventory.md#swiftui-financial-approval-coverage-1-october-2026) records the exact gaps. Ordinary expense/settlement and refund/correction staging now require fresh scoped domain reads before new intent; both slices pass exact-source Foundation/native and routine CI. Recurring create/edit/state/resume/variable staging now has fresh membership/revision/server-day/uncovered-cycle checks,23 focused local integration cases passing and exact-source Foundation/native/routine CI passing. Expense/refund/correction/settlement/rule approval staging now has fresh exact private pending/unexpired reads, with all six new native cases and ten existing exact-recovery cases passing current-source CI; existing account checks and later online retries do not prove that offline initiation is blocked. All approval/recurring variants, full history reconciliation and native/two-phone acceptance remain. Production posting is inactive.
- [ ] **M8 — Renewals, reminders and push.** Renewal CRUD, recipient reminder editors, saved summaries, direct APNs transport, registration/outcomes, bounded worker and protected routes exist with fixture/native/selected hosted evidence. One fictional renewal now completes Alex create, Sam edit and Alex remove through the native UI, with matching canonical reads and retained removal history for both members. See the bounded CRUD checkpoint below. Read-only list/detail snapshots now persist across offline store restart, with separate controlled-failure integration evidence. Wider linked/pagination/conflict cases, populated summaries, provider credentials, worker activation, real hardware enrollment and all six delivery kinds on both phones remain. Push is disabled in the current build18.
- [ ] **M9 — Migration and release rehearsal.** Safe synthetic reconciliation/recovery exists; the latest54-legacy/251-native fixture passes with explicit infrastructure exclusions. Local signed binary/internal TestFlight packaging passes. Hosted current-chain reconciliation, external-writer/old-intent drainage, final release source and both-member usability remain. Production cutover, old-app retirement, purchases and public release are separately gated.

## Latest native receipt recovery

The actual native Photos picker now uploads an audited synthetic fixture to private nest-test Storage. Its exact1,476 normalized JPEG bytes/hash match independent uploader reads; partner, outsider and anonymous requests are denied while unposted. The same native reservation/bytes survive restart and a signed client update. One native Remove deletes only this object, with a deliberately lost reply retaining the scoped cleanup intent; reopening emits no write. Two explicit largest-text corner retries return the same deletion result, one also losing its reply, then normally clear the slot. A misleading smaller-photo error is corrected to removal-specific guidance. Nine focused Foundation/three signed native tests pass with no failures/skips, strict formatting/source limits and1,039-input matching. Both full52-event histories/balances and the existing claimed receipt remain intact; pending inventories are restored. Ordinary Today/stable signed test origins, empty31+7+receipt slots, preserved data/Keychain and owned relay/key teardown pass. [Evidence](../evidence/2026-10-04/swiftui-native-receipt-recovery/README.md). Exact source `a0458304` now passes Nest37195153704/SwiftUI37195153685:490 Foundation cases/41 explicit skips and409 signed-native cases/11 explicit skips, zero failures, strict format/limits and actual signing. The existing claimed receipt also renders through native history/detail/browser navigation and returns to the same entry; both complete histories/Storage remain unchanged. [Viewer evidence](../evidence/2026-10-04/swiftui-claimed-receipt-viewer/README.md) records corrected offscreen/close-icon observer assumptions without repeated opens or signed-URL exports. The later PDF checkpoint above supersedes picking/upload/removal; independently downloaded PDF bytes, new posted attachments, partner native viewing, full accessibility, live AI handoff and both phones remain open. No expense, beta, production action or merge occurred; M7 remains incomplete.

## Earlier verification

Earlier source-specific test totals and result-link checks are preserved in [the 5 October history](progress-history-2026-10-05.md).

## Exact blockers and owner inputs

- **Native QA:** bounded grocery, receipt/history and ordinary expense recovery checks pass. The two-client chore pass verifies one native creation, committed lost-reply handover/exact retry, sender403, recipient accept/decline, offline restart and partner completion convergence, one current/preview and original rotation, then ordinary archive. Setup has ten passes; handover30 passes; completion12 executions retain11 passes/one archived-list observer failure, followed by four successful read-only corrected checks. Both clients finish on Today/stable test origins with64 empty journals. Relays/private keys/configs are removed; all original chore/activity rows, finance and Storage remain exact. Native Done/Return keyboard-source b4dd8494 passes Nest37348042463/SwiftUI37348042498:496 Foundation/41 skips,425 signed-app/16 skips, zero failures, format/limits/signing and guarded UI compilation. The archived-list assertion correction f9ec8792 also passes Nest37350253862/SwiftUI37350254016 with those same counts and gates. CI does not execute hosted pair actions. [Native pair evidence](../evidence/2026-10-05/swiftui-native-chore-pair/README.md) preserves earlier failures and exact gaps. Broader financial/meal/settings/membership conflicts, full accessibility, physical radio loss and both phones remain open; M4 is not closed.

- **AI eligibility:** the last real Swift/provider checks returned Gateway403 `customer_verification_required`; credits/usage0/0. Owner: check the existing valid card on [drrius-projects billing](https://vercel.com/drrius-projects/~/settings/billing), finish any verification prompt and report the changed eligibility. No credits purchase/upgrade is requested. Existing project-only USD1 nonrefreshing cap stays unchanged; then perform one bounded live recheck. The CHF20/month ceiling remains. Two fresh read-only connector checks confirm the correct test-project/team identity, but expose no eligibility or balance. [Context evidence](../evidence/2026-10-06/gateway-read-only-context/README.md). No inference or billing change occurs.
- **Test API:** preview `nest-test-kjn4mw4di-drrius-projects.vercel.app`, backend source `83a5a015`, is READY and now serves the already-authorized stable test API alias. Seventeen read-only checks pass on the preview and again on the stable address: both members see the expected test household, an outsider gets403, anonymous money access gets401 and the recurring worker returns404 while disabled. Existing preview configuration was reused; no server secret was transferred, scheduler activated, financial write/model call sent or production data touched. Hosted populated legacy/approval/provider journeys remain unverified.

- **Worker credential transfer:** automatic approval review rejected exporting the test Supabase server key and scheduler token to Vercel because prior test-deployment authorization did not explicitly cover that transfer. A specific owner approval question is already pending. No transfer, alternate path, schedules or worker activation occurred.
- **APNs:** server-side provider `.p8`, key ID/team/configuration, worker activation and real hardware token/enrollment/six-kind delivery on both phones remain needed. App Store Connect signing credentials are not an APNs provider key. Push stays disabled.
- **Phones:** both partners need the identified build19 installation, Apple sign-in and [phone checklist](native-rewrite/swiftui-phone-acceptance.md), followed by complete weekly/financial-approval/offline-conflict/calendar/privacy/accessibility acceptance. Actual partner tester access is still unverified. Pending phone-feedback questions should not be duplicated.
- **Merge:** [PR85](https://github.com/drrius/nest/pull/85) is freshly read6 October as OPEN/CLEAN at `1c00a089`, with all four checks successful and zero review conversations. The sole latest-commit Greptile response reports the50-credit trial limit, so it supplies no approval. The specific recorded automatic-review exception remains; the Sol waiver is respected and no local/main bypass, purchase or duplicate unchanged-commit request occurs. New source stays on feature branches with CI.
- **Cutover:** existing-data/current-chain reconciliation and external-writer/old-intent drainage precede any production migration, retirement or public release. Safe fixtures and private testing do not authorize these actions.

## Earlier native and migration checkpoints

Handover, offline reads, retained confirmations, preferences and manual-meal checkpoints are retained in [5 October history](progress-history-2026-10-05.md). Their bounded results do not close the milestone gates.

## Retained database boundaries and remaining migration gates

The latest unique-signature inventory has bounded SQL evidence for all 60 retained
legacy public definers and two invokers. Earlier counts of 49–53 pending entries
are historical, not current work. [Public entry review](../evidence/2026-10-05/legacy-invoker-boundaries/README.md).
Full private call chains, direct table/Storage policies, trusted service writers,
external old-client intent drainage, actual Auth/Storage migration and cutover remain open.

A fresh disposable rehearsal applies 54 legacy and 257 Nest migrations and preserves
complete financial reconciliation. The writer inventory now includes private function
EXECUTE and schema USAGE separately. All 219 private signatures and effective privileges
match a read-only nest-test catalog query: 177 authenticated entries have both privileges;
two anonymous EXECUTE entries have no schema USAGE. This is catalog evidence, not proof
of function semantics or safe indirect invocation. Hosted-only legacy differences are
two service-executable wrappers and two service-writable tables; client access is denied.
Six focused inventory/API-fence tests pass, including actual inherited calls and revocation.
[Current inventory](../evidence/2026-10-07/private-function-inventory/README.md).
No hosted mutation, production migration, worker activation, release or merge occurs.

Two retained private calendar triggers now pass 27 real full-chain cases, covering
both-member local edits/pending sync, lease and acknowledgment refusal, direct foreign
updates excluded by RLS, ordinary trigger-call rejection and anonymous schema denial.
Both exact hosted body hashes match the sole source definitions; original calendar
and full financial reconciliation remain unchanged. This is disposable SQL plus
hosted read-only metadata, not live CalDAV or native EventKit evidence.
[Trigger evidence](../evidence/2026-10-07/legacy-calendar-trigger-boundaries/README.md).

## Current native verification

Expense split/payer choices now use full-row native navigation pickers. Both
members' normal and maximal picker, exact-review and percentage-review checks
pass across source-specific evidence. Twelve native methods pass; fifteen earlier
failed methods remain retained, with zero skips. Literal CHF1.01/0.25/0.76,
mismatched-total refusal, native menu paging, raw-baseline return and explicit
unsent discard are verified. Both original scopes,64 empty journals, settings and
local semantics restore. Final privileged metadata matches all eight protected
digests. Source00d65b11 passes both CI workflows; the evidence-format repair also
passes routine CI. No financial Save, inference, release or merge occurs.
Broader financial variants, full accessibility, both phones and M7 remain open.
[Split evidence](../evidence/2026-10-07/swiftui-expense-splits/README.md).

The rendered split pass exposes a review usability issue: transitioning from a
scrolled form retains its lower offset. Candidated097752d gives draft/review/saved
forms distinct native identities while keeping draft values in screen state.
A focused no-Save check requires the amount visible without scrolling, retained
fields after Edit and explicit discard. Mac formatting/source limits pass; fresh
1,142-input signing/build preparation passes. The first Alex maximal transition check fails immediate-amount visibility with
a long description, and restores all scopes/settings/local semantics. The short
QA fixture now isolates top-reset behavior and captures geometry before asserting.
Corrected8d03135f Alex maximal check passes in110.945s: amount immediately visible,
Edit retains both fields, explicit discard and complete restoration. Sam maximal also passes in111.084s, and Alex normal passes in45.821s. All three
methods restore both scopes/64 journals/settings/local semantics. Final metadata
matches the eight protected digests. Long-copy reading and phone acceptance remain
open; candidate native CI37570191489 now passes atd097752d. Corrected test/evidence
source1832fd29 is pushed; a new continuous financial-explanation check passes its1,142-input preparation
and passes at largest text on Alex in112.421s, with no failures/skips and full
restoration. The exact343pt explanation fits within the510pt viewport after reveal;
no multi-viewport text claim is made.

Payment, refund and correction forms now protect unsaved fields/reviewed intent with
the same Keep editing / explicit Discard interaction. Untouched correction compares
with its loaded entry; refund recognizes its initial “Refund” text. All12 both-member
normal/light and maximal/dark native methods pass, with zero failures/skips. Back and
alert controls meet44pt/full-visibility checks; untouched forms close directly.
Both original scopes,64 empty journals,settings/local privacy/first-use semantics
restore. Eight protected fingerprints and +1/−1 centime balances remain exact.
Six confirmation screenshots are directly reviewed. Source `e5bea30b` builds/signs
all1,139 frozen inputs and passes routine37557131439/native37557131449:506 Foundation /
41 skips,473 signed-app /41 skips,four Swift Testing cases,zero failures.
No record/confirm action,release,merge or production operation occurs. Replacement
editing,date/amount/payer variants,VoiceOver and phone/full M7 acceptance remain open.
[Payment/adjustment Back evidence](../evidence/2026-10-07/swiftui-money-draft-back/README.md).

Expense Back now protects unsent fields and reviewed drafts using Keep editing /
Discard edits. Blank/invalid raw fields and date changes count as edits. Attached
receipts and saved financial requests retain their separate recovery paths.
Both members pass normal and maximal-text/dark unsent/reviewed navigation, including
pristine Back, blank reopening, explicit discard and return to Today. Across source
variants, 12 executions retain10 passes/two observer failures/zero skips. The corrected
reader closes the keyboard through incomplete Review, then searches backward for the
preserved earlier description. All tapped Back/alert controls are fully visible and44pt+.
Both scopes,64 empty journals,settings/local privacy/first-use state restore; eight
protected fingerprints, including complete finance, remain exact. Four confirmation
images and two live diagnostic captures are directly reviewed. All1,137 frozen inputs
and product/signing checks match each source. Source57404b37 passes routine37554215370 /
native37554215393; corrected observerbca5f94e passes routine37555574332 /
native37555574402. No financial save, release or merge occurs. Receipt-bearing
Back/date/split variants, VoiceOver and phone acceptance remain open.
[Expense Back evidence](../evidence/2026-10-07/swiftui-expense-draft-back/README.md).

The latest header and padding report is addressed by the shared four-tab layout
already available in private build 19. Root rechecks all eight current layout
files against the reviewed layout and build 19, and directly inspects all four
retained normal-dark root captures together. The header, 20-point horizontal and 14-point top
insets, and 24-point section spacing match. This recheck compares source and existing images,
not a new simulator run or phone acceptance.
[Current layout comparison](../evidence/2026-10-05/swiftui-root-layout/current-layout-revalidation-20261007.json).

The fresh preparation at `55d25d94` fails during Swift compilation of
three diagnostic dictionaries before any SDK, API or UI execution. The 1,127-input
source map matches. Its controller, log and output remain preserved. The localized
correction uses explicitly typed frame and viewport diagnostics. Strict Mac
formatting, source limits, the actual Swift 6/iOS 18 simulator XCTest helper
typecheck and seven exact-body serialization cases pass. The first focused
typecheck omitted the platform's Swift XCTest overlay; its failure is retained
separately from the corrected passing invocation. Root verifies the current
helper hash and all seven serialization results. These checks do not establish
a full app build or UI execution. Routine CI 37523640089 passes `55d25d94`;
its native workflow later fails only at guarded UI compilation with the same
three diagnostic expressions. Foundation runs 506 tests with 41 explicit skips;
the signed app runs 469 with 37 explicit skips; four Swift Testing cases pass.
All have zero test failures. Formatting, source limits and actual app signing
pass. The overall native workflow remains failed; no unchanged-source rerun is
requested. Corrected source `345c82e4` is committed and pushed. Its fresh signed
preparation passes all 1,127 source inputs,
actual compilation of the new maximum-text method, corrected helper and shared
financial row, selected products and three binary hashes, signing, test origins
and build 19. Both original scopes, 64 empty journals and large/light settings
remain unchanged. Preparation itself invokes no SDK, API or UI check.
Root's fresh privileged read-only metadata confirms the existing conversation,
consumed approval, all 15 original conversations, posted three-centime event,
2/1-centime allocations and ±1-centime ledger entries unchanged. This is separate
database evidence, not native authorization or SDK allocation proof. Root reviews
the full execution controller and corrects its reporting so attempted UI calls,
consumed budget and recorded summaries are distinct. The approved single
execution completes on the exact prepared products: the new largest-text/dark
method passes in 423.698 seconds. Fresh dated SDK reads pass for Alex and Sam
in 14.038/14.153 seconds before, and 13.457/11.693 seconds after. One UI attempt,
one consumed budget and a recorded summary are separately confirmed. Original
scopes, 64 empty journals, settings and local state restore through ordinary
foreground launch; selected private plans and scoped caffeinate are independently
absent after terminal. Root's separate database comparison confirms the entire
conversation/approval metadata and financial event/allocations/ledger unchanged
from the fresh before records. No normal journey, old maximum method, fixture,
model or financial decision is repeated. The immutable verifier passes 237
artifacts with five native passes and zero failures. All eight PNG files are
reviewed, with seven distinct images; identical final images do not prove actor
identity. Root independently checks all 37 pans and three fully visible,
enabled, hittable links of at least 44 points. The largest-text Today filter
capture is below the viewport; it was not tapped. Final large/light captures
show the filter fully. Static fields fit after individual reveals, so the tall
text coverage branch was not exercised. The earlier infinite component remains
unknown. Both exact-source CI workflows now pass with the test totals above.
CI compiles this guarded journey; the separate owned Mac execution supplies its
UI proof. Full accessibility and both-phone acceptance remain open.
Evidence checkpoint `053edd86` also passes routine CI 37528059941; its native
source is identical to the tested commit and the default tracked verifier passes.
[Passing maximum-text evidence](../evidence/2026-10-06/swiftui-assistant-financial-history-maximum/finite-geometry-correction/native/README.md).
[Failed-source CI evidence](../evidence/2026-10-06/swiftui-assistant-financial-history-maximum/finite-geometry-correction/source-ci-55d25.json).
[Correction evidence](../evidence/2026-10-06/swiftui-assistant-financial-history-maximum/finite-geometry-correction/type-boundary-correction/readiness.json).

## Recorded chore result navigation

The bounded native check of the existing `already_completed` chore result now passes.
Current read-only nest-test metadata matches Alex's original operation
`90d2eb88-3f35-4a0b-b380-7e9c4db25a7c`, the single occurrence/completion by Sam
on 5 October and its subsequently archived routine. No original assistant
conversation exists for this receipt. A clearly synthetic private-history entry
is prepared from the exact native request/result, explicitly stating that no
model ran and no new completion occurred. Strict fixture setup/removal SQL checks
the fictional household, all 15 original conversations, original receipt and
ten chore/financial table fingerprints. At preparation, nothing was inserted or
removed. The guarded normal/light test went through source and controller checks
before the subsequent build and native execution recorded below.
Source review catches a missing provenance declaration and mismatched synthetic
paragraph before compilation or execution. The corrected 205-line test matches
both exact prepared paragraphs and passes actual Swift 6/iOS simulator typechecking
with the platform's Swift XCTest overlay, strict formatting and all Swift source
limits. Root independently checks both source hashes and the 1,128-input native
tree. The fixture guards pass in a real read-only PostgreSQL transaction, rolled
back with zero fixture rows; the prepared transcript fingerprint is recorded.
This is source and fixture preflight proof, not native app execution.
Source `a085a871` is committed and pushed. Its fresh signed preparation passes
all 1,128 inputs, actual compilation of the test/helper/result row/recorded
section/current-work screen, selected products and three executable hashes,
signing, test origins and build 19. Both original scopes, 64 empty journals and
large/light settings remain unchanged. No SDK baseline, UI method or fixture
insertion had run at preparation. Root reviews the separate baseline controller
and authorizes two read-only SDK checks. The first Alex check then fails after
17.182 seconds with `signedOut`; Sam and the UI are not invoked, no full baseline
is accepted, and no fixture is created. Ordinary restoration passes for both
original actors/household, 64 empty journals, settings and local state. Private
plans and scoped caffeinate are independently absent afterward. The failure is
preserved and held for diagnosis; no unchanged retry or credential repair is
attempted. Both CI workflows pass at `a085a871`: 506 Foundation tests with 41 explicit skips,
469 signed-app tests with 37 explicit skips, four Swift Testing cases and zero
failures; formatting, source limits, signing and guarded UI compilation pass.
This does not turn the failed hosted baseline into a pass.
The retained failure has no path/status/stack/expiry trace. The direct reader
does not use SessionModel lease checks; its HTTP client maps 401 to `signedOut`,
but the exact endpoint and credential cause remain unproven. A guarded test-only
authentication diagnostic is implemented and typechecked against real Nest/Auth
modules. It records safe stage/path/status/media-type metadata for session and
membership verification, with one same-token Supabase user GET permitted only
after a captured membership 401. Membership success and diagnostic completion
are separate. It never exports credentials or performs a domain/UI/fixture
action; normal SDK session refresh may persist existing test credentials.
The single source-pinned diagnostic at `587a2349` now passes in 4.954 seconds.
Its one traced `GET /v1/session` returns 200 application/json and verifies Alex's
expected household membership. The conditional Supabase user GET is not invoked.
This establishes current access; it does not explain the earlier untraced failure.
Both original scopes, 64 empty journals, settings and local state are restored;
independent checks find no selected private plans or scoped caffeinate. Both
normal/light Today captures are visually reviewed. Root's independent read-only
comparison confirms all ten chore/financial fingerprints and the original
receipt/completion unchanged. Both CI workflows pass at `587a2349`: 506
Foundation tests with 41 explicit skips, 470 signed-app tests with 38 explicit
skips and four Swift Testing cases, all with zero failures. Formatting, source
limits, signing and guarded UI compilation pass. The hosted diagnostic is a
separate owned-Mac execution; CI skips its opt-in method.
The sealed 28-artifact diagnostic verifier passes, including source identity,
the actual safe trace, raw-log hash and restoration records.
[Passing membership diagnostic](../evidence/2026-10-06/swiftui-assistant-chore-completion-result/native/auth-diagnostic-71629/README.md).
The next execution uses the verified current membership and those focused
receipt/domain comparisons. Repeating the unrelated full recurring-bill reader
is unnecessary for this read-only chore navigation. Its earlier failure remains
preserved. Root reviews the complete 202-line UI-only execution controller,
preserving the dated `a085a871` prepared products and separate diagnostic source.
Exactly one clearly synthetic history fixture is then inserted into nest-test.
A separate read verifies its exact transcript, two messages, no model turns or
save children, and unchanged original 15 conversations and all ten domain
fingerprints. The one normal/light UI method passes in 51.398 seconds on those
exact prepared products; one invocation, consumed budget and summary are recorded
separately. Both original scopes, 64 empty journals, settings and local semantics
restore; selected plans and scoped caffeinate are independently absent. Root then
removes exactly the synthetic fixture. Fresh read-only comparisons verify zero
fixture rows, all 15 original conversations unchanged, and every chore/financial
fingerprint and original receipt/completion unchanged. All eight captured PNGs
are directly reviewed. Root checks the fully visible, enabled/hittable 44-point
result link and the measured refresh gesture outside action and scroll-bar
bounds. The original Sam/date acknowledgment and current work remain visible
after refresh; the gesture capture does not prove a wire GET. An early
acknowledgment image precedes tab-bar appearance; later current-work and restored
Today images contain it. No financial SDK reader, diagnostic replay, domain
command or model invocation occurs. Evidence checkpoint `50f120ed` passes routine
CI 37533838086; shipping native source is unchanged from the tested commits.
[Passing chore-result navigation](../evidence/2026-10-06/swiftui-assistant-chore-completion-result/native/ui-only-4740/README.md).
[Preserved failure diagnosis](../evidence/2026-10-06/swiftui-assistant-chore-completion-result/native/baseline-failure-9410/diagnosis.json).
[Diagnostic source readiness](../evidence/2026-10-06/swiftui-assistant-chore-completion-result/native/auth-diagnostic-source/readiness.json).
This verifies native result navigation, not live AI execution. Both-phone,
full accessibility, provider, worker/APNs and cutover gates remain open.
[Prepared receipt provenance](../evidence/2026-10-06/swiftui-assistant-chore-completion-result/receipt-provenance-prepared.json).

## Next work

The native cross-week leftovers journey now passes at `a4739172`: Alex adds one
leftover from the existing 19 October dinner to 26 October Lunch; both members'
authorized native reads and rendered recipe details preserve the exact original
snapshot. Sam removes only the new entry through normal confirmation. Both final
native reads see an empty target week. Source revision stays 9; target revisions
are 0/1/2. Removed history, copied recipe and both receipts remain. Eight protected
source/library/grocery/financial fingerprints are unchanged. Ten native methods
pass with zero skips, including the two retained SDK preflight reads. Eleven
isolated PostgreSQL/PostgREST cases pass. Actual products/source, six directly
reviewed action images, raw-log hashes, canonical pair equality and restored
original scopes/64 journals/settings/local semantics are retained in
[the leftovers evidence](../evidence/2026-10-07/swiftui-native-leftovers/README.md).
Plain native meal action dialogs and navigation-link destination pickers fix the
observed undersized targets. Eight pre-save native failures and three tooling
errors are preserved; no committed Add is repeated. Their dated sequence is in
[7 October history](progress-history-2026-10-07.md). Routine CI 37543537027 passes;
native CI 37543536999 now passes. No new TestFlight build, inference,
production action, financial write or merge occurs. M5 remains open for its broader
portion/partner/live-plan/phone criteria.

A fresh unfiltered Calendar baseline on retained `a4739172` UI products reproduces
the two exact contrast findings and frames, with no font report. Both original
scopes, 64 empty journals, settings and local semantics restore. The new candidate
uses Apple's distinct `scrollEdgeEffectHidden` API on the four root scroll views,
guarded to iOS 26; it removes the bottom effect entirely instead of changing its
style. Palette, native tabs, header/content spacing and audit handling are
unchanged. Fresh signed candidate `e21d6b44` compiles all 1,132 inputs and reduces
Calendar's two reports to the same below-bar availability paragraph. The three
other full root audits retain six contrast reports, including four anonymous
reports whose historical identities remain unproven. The four-root candidate
has seven contrast reports, no reported noncontrast findings, and four failed
full audits. Eight screenshots/crops are directly reviewed; original scopes,
64 journals, settings and local semantics restore. No finding is suppressed or
full acceptance claimed. Configured formatting/source limits pass; candidate
routine CI 37544880908/native CI 37544880800 are running.
[Bottom-effect evidence](../evidence/2026-10-07/swiftui-bottom-fade/README.md).

The preceding leftovers source `a4739172` now passes SwiftUI CI 37543536999:
506 Foundation tests/41 explicit skips, 471 signed-app tests/39 explicit skips
and four Swift Testing cases, zero failures. Strict formatting/limits, signing
and guarded UI compilation pass. This source-specific result is separate from
the candidate's pending CI and the actual hosted/native leftovers journey.

Both members now pass normal/light and largest-text/dark unsaved portion
selection, Keep editing, explicit Discard, reopen and return to Today at
`edad88b9`. Eight native methods pass with zero skips, including each member's
GET-only profile before/after. Twelve action images are directly reviewed;
original scopes/64 journals/settings/local semantics restore. The actual UI and
retained SDK sources/products are recorded separately. Alex stays revision 5,
Vegetarian, portion 1/no goal; Sam's profile stays absent. Cooking revision 6,
all preference receipts and eight protected source/library/grocery/financial
fingerprints are exact. The 42-point menu choice is replaced by a native
navigation picker. Thirteen isolated food-profile/PostgREST cases pass. Failed
compilation/three UI methods remain preserved; no Save or model call occurs.
[Portion evidence](../evidence/2026-10-07/swiftui-native-portions/README.md).
Both source-specific CI workflows pass: routine 37547556252/native 37547556372,
506 Foundation tests/41 explicit skips, 472 signed-app tests/40 explicit skips,
four Swift Testing cases and zero failures. Strict format/limits/signing and
guarded UI compilation pass. Saved
portion variation/shared planning, broader settings, full accessibility/live AI
and both phones remain open. No new beta, production action or merge occurs.

Next M3 native pass covers both members' Profile → optional setup → existing
food/cooking/calendar/notification handoffs → Get started, in normal and maximal
text. No Save, permission request or local first-use-choice change is authorized
by the test. Fresh metadata confirms Alex's food/notification records exist,
Sam's do not, and shared cooking exists for both; setup status must reflect those
facts without revealing raw preferences. Food/cooking/notification receipts and
eight protected household/financial fingerprints are captured. The focused setup
service test passes configured-only output, actor/tenant filters and unknown
incomplete reads. Two opt-in native sources pass configured formatting/limits;
no native method has run. [Preparation](../evidence/2026-10-07/swiftui-native-setup/prepared.json).
Fresh source `b7aea8ba` compiles 1,136 frozen inputs. Both native GET-only
setup-status reads pass. Both complete largest-text/dark setup journeys now pass,
including food, cooking, Calendar, notifications, Get started and return to Today.
Setup explanations sit outside tappable labels so whole actions remain visible.
Both revised normal-text journeys and final canonical native reads pass. All eight
methods have zero failures/skips. Canonical statuses and independently read preference
records/receipts plus eight protected fingerprints remain exact. Routine37551574018
and native37551574034 pass at this source, with zero failures.
[Setup evidence](../evidence/2026-10-07/swiftui-native-setup/README.md).
Each completed method restores both original scopes, 64 empty journals, display
settings and local privacy/first-use choices. No Save or permission grant occurs.
Earlier failures remain in [7 October history](progress-history-2026-10-07.md).

The corrected fixed Calendar card supports continuous largest-text reading with
fully visible permission controls. Seven current root contrast reports remain,
including four anonymous findings; all four full root audits fail. No reports
are suppressed, and full forms/VoiceOver/phone acceptance remain open.
[Calendar reading](../evidence/2026-10-06/swiftui-fixed-card-measurement/README.md),
[root contrast](../evidence/2026-10-07/swiftui-bottom-fade/README.md).
Earlier attempts and source-specific CI outcomes remain in
[7 October history](progress-history-2026-10-07.md).

Continue the remaining native journeys and investigate the existing 19
accessibility findings with source-specific evidence. Do not repeat the passing
header comparison or the recorded financial/chore navigation just to obtain
another pass. The milestone checklist identifies the remaining settings,
meal-plan, financial-variant and conflict coverage. Live AI eligibility, worker
credentials/APNs and physical-device acceptance remain separate external gates.
Private build 19 already contains the four-tab header and padding correction;
owner confirmation on the phone remains outstanding.

Earlier preparations, diagnostic comparisons and native checkpoints remain in
[6 October history](progress-history-2026-10-06.md).

The retained seven-report root audit census finds all three identified contrast
reports intersect the native tab-bar region, while four reports lack usable
element/frame identity. This is retained geometry, not a fresh audit or finding
closure. Further palette changes are not justified by this census; anonymous
identity and fully visible text comparison remain required.
[Audit census](../evidence/2026-10-07/swiftui-root-audit-census/README.md).

M9 now includes an effective table-access inventory with seven focused real-PG
tests passing. The complete311-migration rehearsal preserves financial history
and maps179 relations before/after fixture cutover. One read-only nest-test
catalog maps185 relations:120 shared metadata rows exact,59 grant-only differences,
six managed Storage-only relations. RLS/policy counts match for shared rows; no
client-accessible base table lacks RLS. Managed Storage client TRUNCATE grants and
broader service grants require execution-path review; no destructive probe or
grant change occurs. This is inventory, not policy-semantic/Storage/cutover proof.
[Table inventory](../evidence/2026-10-07/table-access-inventory/README.md).

Fresh public-key-only zero-row GET probes reject both storage and private REST
profiles with406/PGRST106. This bounds direct Data API profile exposure while
leaving indirect definer/Storage-service/trusted-writer paths open. Managed
Storage TRUNCATE grants are not exercised or changed.

The three hosted Storage policy predicates are inventoried read-only. One focused
disposable PostgREST/PG receipt-privacy test passes uploader-only unposted bytes,
shared claimed financial attachment access and partner cleanup refusal. This
bounds those policies; broader trusted upload/Storage/external writer acceptance
remains open. No hosted object mutation occurs.

Current hosted table metadata also confirms no public/private/storage views and
no direct client SELECT grant on any private table. Private function semantics
and service writers remain separate open boundaries.

A focused disposable write-barrier test now grants service_role broad public/private
DML/TRUNCATE access with BYPASSRLS. Actual writes succeed before freeze; committed
freeze preserves reads and refuses all four write kinds on both RLS-enabled tables;
unfreeze restores writes. One focused test passes with zero skips. Fast CI adds only
this case. Hosted freeze is never activated; Storage is outside this barrier and
live service writers/production drainage remain open.

Next M5 check is a real saved portion variation on Test Alex only. Fresh metadata
confirms revision5,Vegetarian, no dislikes/goal and portion1; Sam stays unconfigured.
The gated native method permits exactly two UI saves:1.5, actual restart/readback,
then normal restoration to1 and restart/readback. Five original food receipts are
retained. The two Save/restart/readbacks complete, but the final Back label observer fails.
Fresh metadata confirms revision7/portion1, exactly new receipts6/7, unchanged
five original receipts and other preferences, Sam absent and eight protected
digests exact. Full scopes/64 journals/settings/local semantics restore. The
zero-Save readback/return method now passes in32.063s with complete restoration.
Both restart portion screenshots are directly reviewed. The two-save invocation
is consumed and is not repeated; its final-navigation failure remains retained. This is
private nest-test fixture work, not production or live AI planning acceptance.

The broad-service-role barrier regression and table-access inventory now pass
routine CI37572407700 atd8c8c2ed. This CI does not run hosted/profile or native
UI actions. Saved-portion source21b41f37 now passes routine37573041879/native37573041751:
506 Foundation/41 skips,473 signed-app/41 skips, four Swift Testing cases and
zero failures, plus strict format/limits/signing/guarded UI compilation.

Saved varied portions now reach meal generation inputs in a real disposable
PostgREST/PG test: authorized0.5/2.5 saves, changed shared context hash, retained
hard restrictions, requester-only calorie goal and no member identities/goals
in the provider member projection. Unknown availability stays unknown. Both new
and existing auth/isolation context cases pass, zero skips/provider calls. Fast
CI adds this pair. This is context/preparation proof, not successful live model
generation, rendered estimates or full M5 acceptance.
[Planning projection](../evidence/2026-10-07/saved-portion-planning/README.md).

The planning setup gate now has a focused real API/PostgREST regression: missing
partner food setup returns409/conflict before any proposal/receipt/job or provider
call, including exact retry. A new request after fixture repair reaches a synthetic
provider without active meal/grocery writes. One case passes; two initial expected
200 assertions failed at the actual pre-reservation409 boundary and are recorded.
Fast CI adds only the selected case. Real Gateway/phone planning remains open.
