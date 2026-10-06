# Nest progress

Updated 6 October 2026. **The goal is active and incomplete. M0’s native-execution foundation gate is verified; M1–M9 acceptance gates remain open.** [ADR0002](adr/0002-swiftui-client.md) makes SwiftUI authoritative; Expo/RN client code and dependencies are removed. The Effect v4/Vercel AI SDK backend, financial/privacy rules and approved Quiet design remain in force.

Source work is on Linux, `/home/drrius/Work/nest`; owned Xcode/simulator work uses the isolated `/private/tmp/nest-current-qa-82a` mirror on the Mac; the original `/Users/dariussibarium/Developer/nest-swiftui` mirror is preserved. Native CI is separate from that owned simulator. The full prior log is preserved in [dated evidence](progress-history-2026-10-01.md); its old build numbers and pending states are historical.

## Available candidate and current source

**Latest private candidate: SwiftUI0.1.0/build19**, exact `484e5feb`. Candidate routine CI and identical-native-source CI, signed Mac archive/export/package/source audits and Apple VALID/IN_BETA_TESTING/unexpired checks pass. [Release evidence](../evidence/2026-10-06/swiftui-build19/README.md). Update Nest to19 in TestFlight and try the [short phone pass](native-rewrite/build19-first-phone-pass.md). Partner access, installation and phone/design acceptance remain unverified. Live AI, scheduled posting/reminders and push stay inactive; production is untouched.

The preceding build18 includes the shared four-tab header/20pt side/14pt top insets and Quiet Calendar cards, auth/draft/recipe fixes since17 and the demonstrated large-text Today grocery shortcut fix. Twelve header captures/24 Profile and assistant links plus twelve post-fix both-member grocery methods pass with restored settings/identities and unchanged retained history. Nest37374014717/SwiftUI37374014748 pass at the signed source:496 Foundation/41 skips,440 signed-native/18 skips, zero failures, format/limits/signing and guarded UI compilation. All1,080 frozen source inputs and copied IPA hash match. Exactly one private submissionfcd756b6-fe07-4356-8346-521c2c6113da finishes, and the spaced Apple check verifies internal availability. Owned temporary signing keychain/certificate/password copies are removed on both hosts; original credentials/search list and the older unpublisheda3 archive remain intact. No cloud build, expanded invitations, purchase, public release or source merge occurred. Full M1–M9 acceptance remains open.

## Milestone checklist

Unchecked means complete acceptance is outstanding, even where implementation and bounded verification exist.

- [x] **M0 — Decisions and native execution.** Approved ADRs/action inventory, source/build/environment identity, repeatable signed local Xcode/native CI execution and internally available build18 installation path are verified. Current source-matched clean signed-out cold launch and real scoped-session four-tab smoke pass. [Criterion-by-criterion audit](../evidence/2026-10-04/swiftui-m0-foundation/README.md). The plan explicitly separates physical permission/calendar/push acceptance; both-phone installation/sign-in remain M3/M6/M8/M9 gates. Full M1–M9 acceptance stays open.
- [ ] **M1 — Quiet native interactions.** Four SwiftUI tabs and real-data surfaces exist, with selected rendered and large-text simulator evidence. The [artwork inventory](native-rewrite/artwork-inventory.md) now audits the single generated-icon source, native symbols and build13 packaging. Full populated/error/keyboard/VoiceOver/Reduce Motion review and owner design acceptance remain.
- [ ] **M2 — Authenticated offline/AI slice.** Keychain, verified sessions, scoped SQLite and limited exact replay are implemented and tested. Private chat, streaming/interruption/cancellation and honest handoffs exist. Live AI still fails Gateway eligibility403; successful live tool/stream behavior and both-member phone/offline acceptance remain.
- [ ] **M3 — Identity, onboarding and settings.** Quick/comprehensive setup, progressive entry, food/cooking/notification preferences and private-memory consent/recovery exist. New online preflight, canonical settings-result links and account/read fences pass CI. Normal-text owned native saves/lost-reply recovery/stale-form refusal and hosted populated-goal privacy pass. Private-memory pending restart, explicit save/edit/decline/removal, populated RLS and non-resurrecting old-consent replay now pass; both-member forms, broader setup/private settings, accessibility and hardware enrollment remain.
- [ ] **M4 — Today, chores and groceries.** Today filters, ordinary/alternating chore commands, handovers, grocery CRUD/checking, exact scoped SQLite retry/conflicts and corresponding AI commands exist. Source/native/property/RLS checks and selected hosted/owned flows pass. Current grocery edit preflight, retained fields, explicit latest-item reload, committed lost-response restart/update/exact retry, precise removed-intent copy/discard and normal/large-text touch targets now pass owned test-API execution with normal cleanup and unchanged money. Earlier checkbox compatibility/opposing-intent cases and grocery→expense switch/back also pass. Both required grocery-source CI workflows pass. Two independent fictional native clients now verify compatible queue/restart/replay, opposing intent/explicit discard and committed lost-reply/exact retry, then normal removal/Today/stable-origin restoration with64 empty journals and six unchanged hosted fingerprints. The49 executions retain46 passes/three observer failures/zero skips; corrected row observation passes, while whole Add is not rerun. The final observer passes Nest37341752813/SwiftUI37341753014 at head2267bfa4:496 Foundation/41 skips,423 signed-native/14 skips, zero failures; CI does not run the hosted pair fixture. [Pair evidence](../evidence/2026-10-05/swiftui-native-grocery-pair/README.md). The later two-native-client chore pass verifies handover accept/decline, lost reply/exact retry, offline/partner completion convergence and normal archive with retained history; broader membership/schedule conflicts, settings/navigation, VoiceOver/haptics/radio loss, both phones and complete daily-use acceptance remain open; full M4 is not closed.
- [ ] **M5 — Meals and planning.** Week/library/recipe CRUD, saved/one-off placement, move/replacement/removal, proposals, ingredients and preparation exist. A manual seven-day saved-recipe cycle, preparation and replacement have bounded real native/two-member evidence with normal cleanup. Varied portions/partner constraints, live generation/replacement and full phone/UI acceptance remain.
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
- **Legacy completion boundary:** a direct legacy RPC could write a future completion date. New commands now reject future/nonfinite/unsupported dates while preserving historical exact replies. Seven focused database tests and the304-migration rehearsal pass, including21 document/profile/completion-photo/date probes and existing real database AI/epoch dispatch. Manifest55/250 and all four manifest tests pass. Applied only to nest-test (hosted20261004144314): exact body/ACLs, ten real Auth/PostgREST negative probes and unchanged complete finance/attachments/routine history pass. Routine37210225147 and Deep37210426388 pass exact source c5469baf (23 core,50 conflicts,1,235 database/RLS, zero failures/skips). No new native execution claimed;49 other legacy public functions/deeper private paths remain. [Evidence](../evidence/2026-10-04/legacy-completion-date-boundaries/README.md). Prior receipt cleanup checkpoint1d67f235 now passes Nest37208513631. M9 stays open.
- **Receipt cleanup:** two retained legacy cleanup RPCs could invalidate another member's old private native receipt intent. The uploader guard now passes17 focused database tests and the303-migration disposable rehearsal, with16 new attachment boundary probes and exact retained finance/receipt reconciliation. Applied only to `nest-test`: hosted bodies/ACLs match, all52 financial events plus allocation/ledger/upload/intent/Storage digests stay unchanged. Source956cd927 routine CI37207407493 caught the omitted migration checksum entry; it is corrected and four local manifest tests pass. Corrected source3b141cc5 passes routine CI37207727428; deep37207534599 passes unchanged SQL/tests with23 core,50 conflicts and1,231 database/RLS cases, zero failures/skips. [Evidence](../evidence/2026-10-04/legacy-receipt-cleanup/README.md). Existing81 privileged-function warnings remain; ten legacy public RPCs now have bounded reviews, with50 others/deeper private paths open. M9 stays open.
- **Test API:** preview `nest-test-kjn4mw4di-drrius-projects.vercel.app`, backend source `83a5a015`, is READY and now serves the already-authorized stable test API alias. Seventeen read-only checks pass on the preview and again on the stable address: both members see the expected test household, an outsider gets403, anonymous money access gets401 and the recurring worker returns404 while disabled. Existing preview configuration was reused; no server secret was transferred, scheduler activated, financial write/model call sent or production data touched. Hosted populated legacy/approval/provider journeys remain unverified.

- **Worker credential transfer:** automatic approval review rejected exporting the test Supabase server key and scheduler token to Vercel because prior test-deployment authorization did not explicitly cover that transfer. A specific owner approval question is already pending. No transfer, alternate path, schedules or worker activation occurred.
- **APNs:** server-side provider `.p8`, key ID/team/configuration, worker activation and real hardware token/enrollment/six-kind delivery on both phones remain needed. App Store Connect signing credentials are not an APNs provider key. Push stays disabled.
- **Phones:** both partners need the identified build19 installation, Apple sign-in and [phone checklist](native-rewrite/swiftui-phone-acceptance.md), followed by complete weekly/financial-approval/offline-conflict/calendar/privacy/accessibility acceptance. Actual partner tester access is still unverified. Pending phone-feedback questions should not be duplicated.
- **Merge:** [PR85](https://github.com/drrius/nest/pull/85) is freshly read6 October as OPEN/CLEAN at `1c00a089`, with all four checks successful and zero review conversations. The sole latest-commit Greptile response reports the50-credit trial limit, so it supplies no approval. The specific recorded automatic-review exception remains; the Sol waiver is respected and no local/main bypass, purchase or duplicate unchanged-commit request occurs. New source stays on feature branches with CI.
- **Cutover:** existing-data/current-chain reconciliation and external-writer/old-intent drainage precede any production migration, retirement or public release. Safe fixtures and private testing do not authorize these actions.

## Earlier native and migration checkpoints

Handover, offline reads, retained confirmations, preferences and manual-meal checkpoints are retained in [5 October history](progress-history-2026-10-05.md). Their bounded results do not close the milestone gates.

## Broader privileged-function source parity and bounded legacy guards

Fresh hosted reads and a disposable302-migration compilation now match all221 authenticated privileged function bodies (81 public/140 private), plus the delegated calendar-lease helper:222 exact-signature body matches. This is provenance, not a semantic safety claim. Seven legacy public access paths now have an actual guard trace,36 two-tenant/unauthorized/lease/rollback SQL checks in the populated rehearsal and eight actual hosted read-only probes. Search and Storage metadata usage remain tenant bound; known connections/tokens do not authorize another household; expired/mismatched/reentrant leases and foreign event IDs are rejected. Authorized partner calls succeed in rolled-back fixtures. Original calendar/Storage metadata/tenancy and full financial/receipt reconciliation remain unchanged. Fixture reservation/output errors were corrected without bypassing the real trigger; only the final complete run counts. [Evidence](../evidence/2026-10-04/legacy-privileged-boundaries/README.md). Focused formatting/lint and exact-head Nest37198811574 pass at `c73117e3`; native shipping source is unchanged. The remaining53 legacy public functions, deeper private semantics, real hosted Auth/Storage migration, workers/APNs, signup/provider decisions, external writers and complete M9 remain open. No hosted calendar/Storage/schema mutation, secret transfer, inference, beta, purchase, production action or merge occurred.

## Current native verification

The latest header and padding report is addressed by the shared four-tab layout
already available in private build 19. Root rechecks all eight current layout
files against the reviewed layout and build 19, and directly inspects all four
retained normal-dark root captures together. The header, 20-point horizontal and 14-point top
insets, and 24-point section spacing match. This recheck compares source and existing images,
not a new simulator run or phone acceptance.
[Current layout comparison](../evidence/2026-10-05/swiftui-root-layout/current-layout-revalidation-20261006.json).

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

Continue the remaining native journeys and investigate the existing 19
accessibility findings with source-specific evidence. Do not repeat the passing
header comparison or the recorded financial/chore navigation just to obtain
another pass. The milestone checklist identifies the remaining settings,
meal-plan, financial-variant and conflict coverage. Live AI eligibility, worker
credentials/APNs and physical-device acceptance remain separate external gates.
Private build 19 already contains the four-tab header and padding correction;
owner confirmation on the phone remains outstanding.

## Retained verification chronology

The plans below describe earlier preparations. Their later outcomes are recorded
in the current verification section and integration gates; they are not new
execution instructions or current pending work.

Next verification: investigate the named contrast findings with fully visible text, then continue the remaining native journeys and accessibility findings. Physical offline UI/authentication, provider eligibility, worker/APNs and both-phone acceptance remain separate gates.

The19-report census rerun exactly matches its retained output. The prior Today
viewport test positioned the meal link and Calendar heading, leaving the actual
newly failing access explanation13.5pt above the bar and Open Calendar overlapping
it. A new guarded diagnostic will require all three Calendar-card targets fully
inside the measured navigation/tab-bar viewport, with80pt bar clearance, before
one unfiltered contrast audit. No palette, shipping layout, permission or domain
action changes; anonymous reports and the original19 reports remain open.
[Prepared diagnosis](../evidence/2026-10-06/swiftui-today-calendar-contrast/prepared-diagnosis.json).

Next independent journey: the existing private recorded-bill result and posted
expense at maximum text/dark appearance. The normal/light journey already passes;
the new method must expose the exact CHF0.03 expense,2/1-centime allocations and
±1-centime balance changes without invoking another financial decision. Full
action frames remain at least44pt; only long noninteractive text may use measured
overlapping scroll coverage. No new fixture, model call or normal replay.
[Prepared maximum-text plan](../evidence/2026-10-06/swiftui-assistant-financial-history-maximum/prepared-plan.json).

Financial maximum-test source `0b670a53` is committed/pushed after strict Mac
formatting, all Swift limits and scoped formatting/diff checks. Its first
preparation fails before compilation/API/UI because an inherited controller
guard still expects1,126 inputs; the new bounded helper makes1,127. The original
failed controller/output are retained. The distinct fresh preparation passes
all1,127 inputs, actual maximum-test/helper/FinancialApprovalRow compilation,
selected products/binary hashes/signing/test origins/build19 and unchanged
original accounts/64 empty journals/large-light settings. It corrects only the
count and output paths; no native method or financial action is replayed.
The reviewed single maximum execution is now running. Its exact fixture guard
follows the real Centimes wire contract (`"3"` string), rather than coercing it
to an integer; the separate current database metadata remains integer3 and
independently confirms2/1 allocations and±1 ledger deltas. Both metadata proofs
are privileged read-only observations, not authorization evidence. Actual
The before reads pass15.238s/12.303s; the maximum method fails188.795s after
opening the exact conversation and its recorded-bill result. Their full targets
measure343×262pt and303×283pt. Review bill navigation appears, then the test
helper's attach→pan→reveal→read stack raises an infinite-value JSON serialization
exception. Which frame component was infinite was not captured; no product-defect
or full bill-field/Entry-details acceptance is claimed. Both final reads pass
13.011s/12.759s, original accounts/64 journals/local choices/large-light/Today
restore, and plans/caffeinate are independently absent after terminal. Root
reviews all four images and both target frames; independent metadata before/after
preserves the conversation, consumed approval, all15 conversations, posted event,
2/1 allocations and±1 ledger deltas exactly. The failed run is retained before
any observer correction. Routine37519428398/native37519428409 pass exact0b:
506 Foundation/41 skips,469 signed-app/37 skips, four Swift Testing cases,
zero failures and strict native gates. CI does not run the optional hosted journey.
The immutable verifier passes90 artifacts/1,127 UI inputs/1,122 dated SDK inputs,
four native passes and one retained failure; the prebuild count failure stays
separate. [Maximum-text evidence](../evidence/2026-10-06/swiftui-assistant-financial-history-maximum/native/README.md).

The next observer correction tags non-finite diagnostic coordinates explicitly
and validates JSON before serialization. Viewport, scroller, pan endpoints and
every tapped target still require known finite geometry; unrealized targets can
only use bounded revealing, never a visibility exemption or fake coordinates.
Normal-test bytes and the failed90-artifact checkpoint remain unchanged. A new
dated maximum-only method uses the same financial journey. Formatting/source
checks pass for the304-line helper/294-line test. An actual Mac Swift/Foundation
probe executes the exact extracted usable/diagnostic bodies for seven finite,
zero, null, infinite, NaN and computed-overflow cases; every diagnostic validates
and serializes, while only finite valid geometry is usable. Root independently
checks the current source hash and seven outcomes. This is serialization proof,
not native UI execution. No new app build, hosted read or UI invocation yet.
Root read-only metadata independently confirms the existing owner-private
conversation, consumed approval and all15 original conversations unchanged.

## Current integration gates

Fresh `fe90e184`/1,126-input signed UI preparation passes. The maximum-only
handoff journey passes212.045s; all four dated699 SDK reads pass
Alex14.622s/Sam13.168s before and11.987s/11.967s after. Both original scopes,
64 empty journals and initial settings restore through ordinary foreground launch.
Root inserts and strictly removes synthetic conversation
`10b77a97-1709-4799-9b17-8cb3a613d402` once each. Independent cleanup verifies
all three handoff fixtures absent, all15 original conversations fingerprint-exact,
unchanged disabled calendar consent and zero busy snapshots. Normal navigation
is not repeated; native domain/model mutations remain zero. All six destinations
open with fully visible targets (five303×119pt, Profile303×67pt). All13 measured
Conversation pans avoid the scrollbar and action regions. The long ingredient
explanation is readable through426.5pt overlapping viewport coverage. All19
exported screenshots are reviewed by the worker; root directly reviews eight
and independently verifies every target and pan. The immutable verifier passes179
artifacts/1,126 UI inputs/1,122 dated SDK inputs and5 native passes/zero failures.
[Native evidence](../evidence/2026-10-06/swiftui-assistant-handoff-targets/maximum-scrollbar-correction/native/README.md). Routine
CI37514014901 and native CI37514014664 pass exactfe90:506 Foundation/41 skips,
469 signed-app/37 skips, four Swift Testing cases, zero failures and strict
native gates. CI compiles the guarded journey; actual execution is the separate
Mac evidence above. Build19
does not include the later assistant label changes; full audit/phones/live AI
remain separate gates.

Evidence checkpoint `e8f5d881` retains the passing default tracked verifier.
Routine CI37515788238 fails only Oxfmt on root-owned `root-review.json`:
its four-number scrollbar array needs inline formatting. The scoped artifact
check omitted this external supporting record. The formatting-only correction
preserves its parsed data and every executed native artifact. Refreshed supporting
hashes pass the default179-artifact verifier; global Oxfmt passes8,413 files and
root independently compares identical parsed review data before/after formatting.
No native journey or fixture creation is repeated.

Corrected checkpoint `940ab066` passes routine CI37516014474. New diagnostic
source `abc39697` adds a guarded full-Calendar-card viewport check, preserving
the old method and unfiltered issue handler. Strict Mac formatting, all Swift
source limits, scoped Oxfmt and diff checks pass before push. Fresh signed
preparation passes all1,126 inputs, actual changed-test/Today compilation,
selected products/binary hashes/signing/test origins/build19. Both accounts,
64 empty journals and large/light settings remain unchanged. The reviewed single
execution passes both baseline reads (15.064s/12.613s), then the audit fails51.358s
with two unsuppressed contrast findings after successful full-card placement.
Final reads pass13.400s/11.543s; original accounts/64 empty journals/local choices,
large/light and Today restore, with plans/caffeinate independently absent after
terminal. The two findings are now All proposals and saved decisions (6.5pt
above the bar) and Manage renewals (under the bar); none names the guarded
Calendar targets. Root inspects all eight screenshots and checks all three
target frames/pans. Exact sRGB glyph/background pixels measure5.3028 for the
Calendar explanation and7.4927 for its link; these are measurements of those
clear targets, not the newly reported controls. The immutable verifier passes82
artifacts/1,126 UI inputs/1,122 dated SDK inputs/four native passes/one retained
UI failure/two unsuppressed reports. No prior finding is closed, repeated or
suppressed. [Diagnostic evidence](../evidence/2026-10-06/swiftui-today-calendar-contrast/native/README.md).
Routine CI37516621666 and native CI37516621960 pass exactabc:506 Foundation/41
skips,469 signed-app/37 skips, four Swift Testing cases, zero failures and strict
native gates. The native input tree is identical at evidence checkpoint4bcd17a9.
CI compiles the guarded diagnostic; the separate manual audit remainsFAIL.
[CI source evidence](../evidence/2026-10-06/swiftui-today-calendar-contrast/source-ci.json).

The required authorization/database deep gate passes at exact5b784a10: run37499602861, job112392899761. All23 core HTTP,50 terminal-conflict and1,269 isolated PostgreSQL/RLS cases pass with zero failures/skips, including both new internal-table RLS tests. The workflow uses checksum-pinned PostgREST16.3 and disposable database fixtures, without hosted credentials or production migration. Runtime/security/fixture source remains identical at7f079fad; its native identifier/test/target edits are outside that comparison. Routine37499334703 passes5b. [Deep evidence](../evidence/2026-10-06/deep-integration-current-backend/README.md). This does not close hosted Auth/Storage, external-writer, provider, phone or cutover acceptance.

The private financial-result navigation now passes on fresh signed source7f079fad. The existing fictional interrupted conversation opens its canonical consumed bill receipt, then the exact CHF0.03 expense and2/1centime allocations with±1centime balance changes, before returning to Today. The transcript link was39pt high; its shared label now measures303×44pt, and View recorded expense measures308.5×44pt. Both are enabled, hittable and fully visible. The native method passes63.254s; all four fresh paired SDK reads pass11.434/11.017/11.360/10.222s with complete62-entry history/eight rules/private receipts unchanged. Original scopes/64 journals/large-light settings/foreground are restored. Root directly inspects four representative captures. [Evidence](../evidence/2026-10-06/swiftui-assistant-financial-history-links/README.md) retains unused8a preparation,815 diagnostic-guard preparation, the earlier scope-fence failure with unknown mismatch values and the real39pt failure. No model, new conversation, financial decision or domain mutation occurs. Retained699 SDK products remain explicitly dated; their Core/Session source is unchanged at7f. Currentdocs c163 routine37504546087 and exact7f [native37504210767](https://github.com/drrius/nest/actions/runs/37504210767) pass:506 Foundation/41 explicit skips,469 signed-app/37 explicit skips, four Swift Testing cases, zero failures, strict formatting/source limits/signing and guarded UI compilation. CI compiles the hosted UI method; the separate Mac execution above supplies its rendered proof. Largest text, other result types, live AI, full accessibility and phones remain open; build19 lacks the target fix.

The same plain-label pattern remains in17 nonfinancial assistant links: six device handoffs, memory/preparation/reminder results, renewals, retained-rule results and saved summaries. They now reuse QuietActionLabel, keeping their destinations, account generation and honest handoff text intact. All five changed files pass individual strict Mac formatting, source limits and diff checks; combined-file formatter input first rejects duplicate imports, corrected by linting each real file. Sourcef9828e50 passes routine37506214811/native37506214854:506 Foundation/41 skips,469 signed-app/37 skips, four Swift Testing cases and zero failures with strict format/limits/signing/UI compilation. Actual geometry/navigation for every updated result type remains open. The earlier7f financial route is separate proof, not evidence that these newer rows execute. No new fixture, model or domain mutation occurs.

A bounded catalog finds11 financial result groups and no nonfinancial handoffs. Fresh signed dff8d993 preparation9257 passes all1,125 inputs and actual compilation of five updated Assistant files plus its guarded test. Baseline57979 passes dated699 reads12.958/12.370s and original scopes/64 journals/empty calendar change-removal journals. One synthetic six-handoff conversation4e809372 is inserted once in nest-test, with no model-turn/save children and15 original conversations still fingerprint7284c1c22df502cc7fb70a8b9ff0e903. Normal/light navigation passes82.145s: all six links303×58pt, fully visible/enabled/hittable, opening the real native destinations. MAX fails111.922s at a noninteractive589.5pt ingredient explanation being required to fit510pt; its first three303×119pt action targets pass. Calendar/Ingredients open, while busy-sharing is honestly omitted because its unrequested-permission button is not established; later destinations are unattempted. Root directly inspects the retained failure. Final reads13.949/13.207s and original scopes/64 journals/large-light/Today restoration pass; ingredient receipt/sequence9/choices and calendar selections/journals stay exact. The baseline controller/shadowed scope trace is preserved, while reviewed execution fixes its stage-key shadow and requires an existing disabled consent row. Root removes only the unchanged childless fixture once:15 original conversations, disabled consent10/generation17/fingerprintcbdde232d6ec441e0caa57ac6d4a1072 and zero busy snapshots remain exact. [Cleanup](../evidence/2026-10-06/swiftui-assistant-handoff-targets/fixture-cleanup-verified.json). All native/model/domain mutation budgets remain zero; privileged synthetic fixture setup/removal are explicitly separate. A new maximum-only observer correction is being prepared: continuous tall-paragraph coverage, unchanged full-visible44pt action guards and bounded safe permission-state discovery. New fixture4c528a2f-42a3-4e3d-a909-5a0ff7f106da is not inserted; old source/failures remain immutable and normal is not repeated. This is synthetic link verification, not live AI proof.

Root's normal/light screenshot sample exposes muted enabled handoff labels: source RGB100/110/101 matches544 solid glyph pixels on sRGB218/226/222, contrast4.0186 against the4.5 normal-text threshold. The six labels now explicitly use the existing accent51/93/73; its calculated contrast against the same background is5.6782, not yet a new rendered measurement. Notes, sizes, destinations and consent rules are unchanged. [Diagnostic](../evidence/2026-10-06/swiftui-assistant-handoff-targets/observed-handoff-label-contrast.json) cites the primary contrast guidance. Initial modifier indentation fails strict lint, then corrected real-file lint passes. The354-line guarded test adds a new normal capture-only method and corrected maximum navigation, retaining the old UUID/source methods. Static long text proves beginning/end viewport coverage with stable height and overlap; every action still needs a full-visible44pt target. Both helpers and source limits/strict Mac formatting pass. Old183-artifact/22-PNG evidence verifies5 native passes/one retained failure and exact fixture cleanup; Root reviews four representative captures. New4c528a2f source/SQL/transcript are prepared but not executed. [Old phase](../evidence/2026-10-06/swiftui-assistant-handoff-targets/native/README.md). Fresh0f203577 preparation70277 passes all1,125 inputs and changed-row/test compilation/signing/origins. Baseline31910 passes dated699 Alex12.664/Sam13.128 full62-entry/eight-rule/private-receipt reads and original scopes/64 journals/empty privacy queues/large-light/local choices. New4c528a2f is inserted once with no turn/save children and unchanged15 original conversations/consent/busy snapshots. Normal capture-only passes37.280s: six303×58pt full-visible targets and actual accent pixels51/93/73 on218/226/222 verify contrast5.6782. Root directly inspects notifications/Profile captures. [Rendered contrast](../evidence/2026-10-06/swiftui-assistant-handoff-targets/maximum-reading-correction/rendered-normal-label-contrast.json). CorrectedMAX fails231.293s before opening Setup. Its four preceding destinations open with no omissions, including visibly established unrequested Calendar permission; the589.5pt ingredient explanation is continuously readable with508pt beginning/end coverage and426.5pt overlap. The303×119pt Setup link stays below viewport despite24 pans. Retained AX identifies two scrollbar regions342/74/30/510 containing gesturex371; measured target jumps/scrollbar movement explain the observer interference. Root inspects the exact failure/frame/24-motion sequence; no action-size or shipping defect is inferred. Setup/Profile maximum navigation remain incomplete. Final reads10.903/12.058s, original scopes/64 journals/large-light/Today, ingredient receipt/revision9/choices and empty calendar selections/journals remain exact. Root removes only unchanged4c once, independently proving both fixtures absent and original15 conversations/disabled consent10-generation17/busy0 fingerprints unchanged. [Cleanup](../evidence/2026-10-06/swiftui-assistant-handoff-targets/maximum-reading-correction/fixture-cleanup-verified.json). Exact0f routine37511260550/native37511260574 CI both pass:506 Foundation/41 skips,469 signed-app/37 skips, four Swift Testing cases, zero failures and strict format/limits/signing/guarded UI compilation; Root checks the full public log. CI compilation is separate from the two actual Mac UI outcomes. A new maximum-only Conversation left-padding observer plan10b77a97-1709-4799-9b17-8cb3a613d402 is prepared, not inserted or executed, keeping24-step/full-visible44pt action checks and all earlier sources/failures. Normal capture/navigation is not repeated. Live model/full audit/phones remain open.

The localized Conversation pan observer now uses measured left paddingx24, requiring one actual transcript ScrollView, endpoints outside actual vertical scroll-bar regions and left of every handoff-button region. Other destination gestures,24 attempts and full-visible44pt action guards stay intact. The362-line test plus51-line geometry helper pass strict Mac formatting/source limits/diff checks. A new named maximum-only method binds prepared10b77a97; source app/foregrounds/normal capture remain unchanged. Old0f192-artifact/20-PNG verification passes5 native methods with one retained failure; Root directly reviews the two normal target images, failed Setup position and24-motion sequence. The subsequent maximum-only execution and cleanup are recorded above; this paragraph retains its preparation chronology. Neither normal capture nor normal navigation is repeated. [Prepared maximum plan](../evidence/2026-10-06/swiftui-assistant-handoff-targets/maximum-scrollbar-correction/prepared-plan.json).

The API guide now reflects the implemented SwiftUI composer/history and journaled tool families. It also corrects spend guidance: project budgets cover OIDC traffic; API-key traffic needs an applicable API-key/team/user budget. Runtime credentials, the existing USD1 nonrefreshing project cap, routing and billing remain unchanged. Current Gateway guidance still requires a valid team payment method for free-credit verification; documentation research makes no authenticated credit request or inference and does not prove changed eligibility.

The four home tabs share one header and20pt side/14pt top insets; Calendar uses Quiet cards. Twelve normal/light, normal/dark and maximum/dark native captures and24 Profile/assistant links match header anchors within0.5pt. All images were reviewed; two unchanged-date picker checks pass. All eight shared-header/root-layout source files match both the reviewed layout and available build19 at484e5feb; the four normal/dark images were rechecked on6October. [Build19 source comparison](../evidence/2026-10-05/swiftui-root-layout/build19-layout-revalidation.json). The same eight files still match at5ed4084e after the latest phone-layout report; all four retained normal/dark captures were inspected again. No new simulator run or release is claimed. Actual Calendar selection, full accessibility and phones remain open. [Layout evidence](../evidence/2026-10-05/swiftui-root-layout/README.md).

The manual seven-day week has nine recipe,37 placement/read and eight move/read native checks. Eight ingredient checks retain the saved rice-only choice across navigation and confirm one100g grocery; both members agree. Original groceries/links and14 other retained row sets remain exact. Ingredient source923f1db passes Nest37372405961/SwiftUI37372405933:496 Foundation/41 skips,440 signed-app/18 skips, zero failures, format/limits/signing/UI compilation. The later edit/preparation evidence below supersedes those earlier pending checks; saved-notice readability and the unsuppressed invalid-frame warning remain open. [Meal evidence](../evidence/2026-10-05/swiftui-native-manual-week/README.md), [ingredients](../evidence/2026-10-05/swiftui-native-ingredient-review/README.md).

Both members pass six ordinary grocery-read methods. The maximum/dark check then reproduces an oversized Today grocery shortcut before any action. Accessibility text now gets full card width; decorative icons remain in the ordinary layout. Twelve post-fix native checks pass across normal/light and maximum/dark, with813 matching inputs, unchanged canonical groceries/history, Today/large/light/original actors and64 empty journals each. No grocery action is repeated. Sourcee7926c89 is pushed; Nest37374014717 and SwiftUI37374014748 both pass:496 Foundation/41 skips,440 signed-app/18 skips, zero failures, format/limits/signing/guarded UI compilation. [Readback and retained failure](../evidence/2026-10-05/swiftui-native-grocery-readback/README.md). These focused passes do not close the original20-report accessibility audit.

Private0.1.0/build18 is now internally available. The original signeda3 candidate/native CI pass are preserved; all four routine attempts fail before runner allocation. No further unchanged-source retry is requested. Before its single submission, the candidate was refreshed from exacte7926c89 to include the demonstrated accessibility fix;1,080 frozen source files match before archive/after export. Native signing/package/privacy/test origins/arm64/dSYM checks and copied IPA hash pass; owned temporary credentials are removed. Both current-source CI checks pass. Exactly one authorized submissionfcd756b6-fe07-4356-8346-521c2c6113da reports FINISHED; the first Apple check does not yet list18, then the spaced21:22:43 UTC check verifies VALID/IN_BETA_TESTING/unexpired. Build18 is now internally available; actual phone update/design acceptance remain unverified. [Updated preparation](../evidence/2026-10-05/swiftui-build18-layout/README.md), [original](../evidence/2026-10-05/swiftui-build18/README.md). Live AI, worker/APNs, both-phone acceptance and production cutover gates remain separate; internal availability is verified; actual phone acceptance remains open.

## Earlier verification detail

Recipe/preparation, settings drafts, renewals/reminders, contrast experiments, financial and authorization checkpoints are preserved in [6 October history, part 3](progress-history-2026-10-06-part3.md). Their original passes, failures, source identities and blockers remain intact. Current milestone acceptance and the latest native/CI state are listed above.
