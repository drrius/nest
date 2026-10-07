# Remaining acceptance

Updated 7 October 2026. This list sequences the remaining work without changing
the product brief, milestone exits or release gates. Passing dated checks remain
valid within their recorded scope. Repeat them only for affected source changes,
a new failure or an uncovered requirement. M1 through M9 remain open.

The owner prioritizes usable daily flows and safe diagnostics over further expansion
of unchanged QA variants. Money currently fails in the owner test household because
only Darius is linked; the two-member simulator fixture hid that setup issue.
[Diagnosis and focused fixes](../../evidence/2026-10-07/money-setup-diagnostics/README.md).
Verified partner linking is required; client diagnostics and clear setup errors
are implemented, locally checked and included in internally available build25.

| Work                       | Existing proof                                                                                                                                                                                    | Remaining proof or blocker                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Quiet UI and accessibility | Shared tab headers/insets, selected normal/maximal text journeys and financial result visibility; native keyboard warning reproduced in an isolated SDK-only app                                  | Remaining contrast reports, VoiceOver/Reduce Motion, populated/error/keyboard usability and owner acceptance; track the diagnosed SDK warning without treating it as an unexplained Nest layout defect |
| Identity and setup         | Apple sign-in implementation, scoped sessions, setup/preferences and selected two-member simulator journeys                                                                                       | Both phones sign in, optional setup/settings remain private, real session interruption and recovery                                                                                                    |
| Daily use and offline      | Real two-client grocery/chore retries, restarts, conflicts and receipt recovery; reschedule/skip/archive completion races                                                                         | Phone radio loss/reconnection, haptics, membership/access-revocation variants and uncoached daily tasks                                                                                                |
| Meals                      | Both-member manual seven-day plan and move/readback; separate ingredient confirmation; preparation create/edit/date/completion; saved portion restart/restoration and private planning projection | Live generation/replacement/approval with ingredient review, rendered varied estimates and full partner weekly phone journey                                                                           |
| Calendar                   | EventKit and bounded timed/all-day/DST/sharing/privacy checks                                                                                                                                     | Both phones with real calendars, permission revocation, stale/background/offline behavior and payload privacy                                                                                          |
| Money                      | Domain/database invariants, real full/partial native posting, retained history, API-outage refusal, claimed PDF/native partner viewer and exact byte download                                     | Uncovered financial variants and hosted interruption/cancellation states, scheduled-cycle audit and both-phone journey                                                                                 |
| Live AI                    | Tools/contracts, private persistence, approval enforcement and fixture/provider error handling                                                                                                    | Last live result403 customer_verification_required is historical; fresh credit check awaits the specific token approval. Then bounded live stream/tool/approval verification after eligibility changes |
| Push and scheduling        | APNs transport, enrollment/outbox/worker source and focused tests                                                                                                                                 | APNs provider key/configuration, specific blocked credential-transfer approval, worker activation and six delivery kinds on both phones                                                                |
| Migration                  | Disposable full-schema reconciliation, boundary inventories and rollback/retry rehearsal                                                                                                          | Remaining private/Storage/trusted-writer semantics, authorized existing-data rehearsal, external writers and pending-intent drainage                                                                   |
| Delivery                   | Build23 is internally available; its exact candidate CI/archive/signing pass                                                                                                                      | Actual installation, both-member acceptance and final release checks. Production cutover stays separately gated                                                                                        |
| Merge                      | PR85 previously had green checks and no conversations                                                                                                                                             | Greptile trial limit supplies no approval; specific automatic-review merge rejection remains. No alternate main push bypass                                                                            |

The7 October native reschedule, skip and archive races now have complete queued/
restart/409/exact-discard/partner-read/cleanup evidence with original data
reconciliation. Membership/access-revocation variants and physical-radio
acceptance remain. These bounded results do not close the full daily-use or M4 gates.

Evidence reconciliation7 October:

- [Actual EventKit foreground refresh](../../evidence/2026-10-07/swiftui-eventkit-foreground/README.md)
  passes one signed app-hosted integration with a synthetic local event changed
  through a separate real EventKit store. Private presentation stays cleared until
  refresh, then shows exact updated fields with preserved selection. Model
  lifecycle is called directly; rendered scene hooks, Apple sync and phones remain
  unverified. Only the owned fixture/simulator is removed; shipping source is unchanged.

- [Read-only production writer inventory](../../evidence/2026-10-07/production-catalog-inventory/README.md)
  identifies eight active legacy cron registrations, 153 public/private functions
  and two active Edge writers. All nine returned Edge application files match
  audited legacy source. Catalog queries confirm read-only scope and exclude
  household/Auth/Storage data rows and secrets. Dependency/configuration/runtime
  semantics, existing-data reconciliation, writer decisions and drainage remain
  open; no production mutation or cutover occurs.

- [Calendar foreground model](../../evidence/2026-10-07/swiftui-calendar-foreground/README.md)
  now passes one signed app-hosted check with a controlled local reader. Visible
  details clear while inactive, selection persists, and refresh reads changed
  events without another permission request. Screen hooks are inspected only;
  real EventKit background changes, radios and phone privacy acceptance remain open.

- [Unqueued household read revocation](../../evidence/2026-10-07/swiftui-household-read-revocation/README.md)
  now has failing-before evidence and a shipping correction. Twenty-five signed
  native checks pass: read 403 reverifies membership, revoked access hides cached
  household presentation and removes the active offline scope, valid members keep
  saved data, and queued retry/account-switch behavior is preserved. Hosted
  revocation, physical radios and uncoached daily use remain open. This fix is included in internally available build24; phone installation
  remains unverified.

- [Variable-rule edit and resumption](../../evidence/2026-10-07/swiftui-recurring-edit-resume/README.md)
  now record creation, a note edit, pause, explicit prospective resume and
  cancellation through the real hosted native client. The final resumed suffix
  passes; earlier observer failures stay recorded. All eleven older rule hashes
  and the full financial snapshot match, with no scheduler activated. Live AI,
  actual scheduling and phones remain open.

- [Direct manual cycle linkage](../../evidence/2026-10-04/swiftui-native-manual-cycle-link/README.md)
  already proves one explicit native link, both authenticated members' unchanged
  financial reads and recorded-receipt recovery after restart. The existing
  [retained confirmation](../../evidence/2026-10-04/swiftui-retained-confirmation-recovery/README.md),
  [dismissal](../../evidence/2026-10-04/swiftui-retained-dismissal-recovery/README.md)
  and [adoption](../../evidence/2026-10-04/swiftui-retained-adoption-recovery/README.md)
  also have hosted native decisions and interrupted-save recovery. Preserve this
  bounded evidence. Later Quiet section/value styling still needs current UI
  acceptance; it does not erase these financial outcomes or justify replaying
  completed writes. Private live approvals and phones remain open.

- [Fixed-rule lifecycle](../../evidence/2026-10-07/swiftui-recurring-lifecycle/README.md) now passes direct native creation, explicit automatic mandate, pause and cancellation against the hosted test API. Earlier rules and all financial history remain unchanged, with no scheduler activated. Editing, resumption, manual linkage, actual scheduling, AI and phones stay open.

- [Direct correction/refund posting](../../evidence/2026-10-07/swiftui-correction-refund/README.md) now records and reads back the expense/reversal/replacement/refund chain through native UI and the hosted test API. Three commands restore both balances while preserving all earlier financial hashes. The correction picker target is enlarged to 44 points. Partner rendered readback now passes separately without any financial change. Physical phones, live AI, other variants and the retained writer warning remain open.

- [Actual EventKit revocation](../../evidence/2026-10-07/swiftui-eventkit-revocation/README.md) now verifies OS-denied reads and persisted-selection clearing across test-host restart in two signed native checks. It uses a fresh simulator and one synthetic event. Physical phones, rendered privacy behavior and live busy sharing remain open.

- [Remaining meal read callers](../../evidence/2026-10-07/swiftui-meal-read-callers/README.md) now use one fenced week-read command. Held proposal/preflight replies and invalidated ingredient updates are rejected; existing choices, pending requests and approvals retain their behavior in 32 native app and nine SQLite checks. Hosted permissions, live AI and phone acceptance remain open.

- [Planned detail/preparation denial](../../evidence/2026-10-07/swiftui-meal-detail-denial/README.md) now removes denied read copies and rejects a held old detail reply, preserving pending commands. Fourteen signed app and fourteen SQLite checks pass locally. Hosted permissions, proposal/ingredient read paths and phone rendering remain open.

- [Meal read denial races](../../evidence/2026-10-07/swiftui-meal-read-denial-races/README.md) close both controlled late-success/denial orders for week-cache writes. Final native recovery cases and SQLite restart/fresh-read checks pass. Hosted revocation, other recipe/proposal read-only paths and phones remain separate gaps. This shipping change is newer than build 22.

- [Today saved meals](../../evidence/2026-10-07/swiftui-today-meals-cache/README.md) now appear before the network reply and remain visible during refresh/unavailability. Five signed session/SQLite checks and one final controlled SwiftUI capture pass without skips; both screenshots are inspected. Rendered hosted interruption, larger text, day rollover and phones remain unverified. This shipping change is newer than build 22.

- [Money history spacing](../../evidence/2026-10-07/swiftui-money-history-spacing/README.md) reproduces an actual 24-point gap between populated rows and verifies its removal in two signed native journeys. Preview and full history retain complete visible targets; screenshots are inspected. This shipping fix is newer than TestFlight build 22. Full accessibility and phone acceptance remain.

- [Standalone native contrast diagnosis](../../evidence/2026-10-07/swiftui-native-contrast-probe/README.md) reproduces strict below-bar contrast reports with standard SwiftUI colors, including Nest's hidden bottom fade. The no-tab control keeps identical paragraph frames and removes strict failures. All three diagnostic audits still fail on retained contrast findings. This guides the remaining investigation without clearing Nest's audit, historical above-bar reports, accessibility or phone gates. Do not repeat palette/fade/clipping workarounds for this already reproduced case.

- [Posted PDF and partner browser/download](../../evidence/2026-10-05/swiftui-posted-pdf/README.md#partner-receipt-and-account-boundaries) already establish both fictional identities on one simulator, exact640-byte download and native browser return. Physical phones, live AI handoff and full accessibility remain; do not repeat upload/posting/account switches to clear an obsolete pending statement.
- [Saved portions](../../evidence/2026-10-07/swiftui-saved-portion/README.md) and [planning projection](../../evidence/2026-10-07/saved-portion-planning/README.md) establish actual saved variation/restart/restoration and authorized inputs. Live generated estimates and phones remain.
- [Manual week](../../evidence/2026-10-05/swiftui-native-manual-week/README.md), [ingredient review](../../evidence/2026-10-05/swiftui-native-ingredient-review/README.md), [preparation](../../evidence/2026-10-06/swiftui-native-preparation/README.md) and [completion](../../evidence/2026-10-06/swiftui-native-preparation-completion/README.md) supersede those records' earlier pending move/edit/preparation notes within their stated scope. Live proposals, complete losses/conflicts, accessibility and phones remain.
- [Direct variable bill](../../evidence/2026-10-04/swiftui-native-variable-bill/README.md) already proves native posting and recorded restart/client-update recovery. [Hosted lost-reply recovery](../../evidence/2026-10-07/swiftui-variable-bill-lost-reply/README.md) now proves one committed POST, offline restart/local discovery, receipt-only recovery, Done, partner SDK read and retained history. [Controlled native cancellation restart](../../evidence/2026-10-07/swiftui-variable-bill-cancellation/README.md) proves local command/flag preservation and recorded-versus-cancelled recovery. [Hosted cancellation reply recovery](../../evidence/2026-10-07/swiftui-variable-bill-cancel-reply/README.md) now proves the real dialog, lost cancellation reply, exact restart/retry, Continue and no financial posting. [Ordered local native/API races](../../evidence/2026-10-07/swiftui-variable-bill-ordered-races/README.md) now force both database commit orders with native SQLite reopening and no write replay. Hosted/UI races, live AI handoffs and phones remain uncovered; the distinct retained-draft journey does not prove those variants.
- [Keyboard diagnosis](../../evidence/2026-10-07/swiftui-keyboard-toolbar-probe/README.md) attributes the warning to native InputAccessoryBar on the tested runtime. Actual keyboard usability/phone acceptance remains; removing useful controls merely to suppress that warning is not a requirement.

Work order:

1. Preserve the bounded native evidence for recurring configuration
   edits/resumption, direct manual linkage, retained-rule decisions,
   fixed-rule creation/pause/cancel, correction/refund and full/partial
   settlements. Verify remaining presentation gaps in the consolidated UI/phone
   pass rather than posting again solely to refresh evidence. Existing
   model/database evidence stays valid. Private live approvals and scheduled
   posting still require their separate integration proof.
2. Keep the verified build 23 candidate stable for phone acceptance. Batch necessary shipping
   fixes for a consolidated beta. Test-only/evidence changes do not need another
   beta. Build 23 is the available owner candidate and includes the later fixes.
3. Complete live AI only after the specific credential/eligibility blocker changes.
   The required journey is actual private streaming/tool execution, visible
   financial approval and generated week/replacement/approval/ingredient review.
   Source and controlled fixtures do not close it.
4. Complete scheduled posting and six reminder delivery kinds only after the
   blocked worker configuration and APNs provider setup. Verify actual phone
   delivery, recipient/mute behavior and cold-start links. No scheduler activation
   is inferred from source merges or fixture success.
5. Gather both partners' phone acceptance using the existing checklist: daily
   grocery/chore radio-loss recovery, weekly planning, Money, real Calendar
   sharing/revocation, light/dark/large text, VoiceOver, Reduce Motion and uncoached
   use. Simulator evidence is retained within its scope and does not replace this.
6. Finish migration/private-writer/Storage reconciliation and pending-intent
   drainage, then verify the final release binary. Production data rehearsal/cutover,
   retirement and publication remain separately authorized actions. Read-only
   catalog and deployed-source identity are now recorded within the audit scope. The current
   fixture owner improvement does not establish hosted privilege equivalence.

These are the existing release requirements. Do not turn a passing journey into
an expanding list of hypothetical variations. New local checks must answer a
named uncovered requirement, an affected source change or a concrete failure.

The progress log records detailed evidence and exact blocker history. This list
does not authorize purchases, production mutation, new invitations or previously
rejected secret transfers. The removed continuation automation stays removed.

Earlier dated checkpoints are preserved in [remaining-work history](remaining-work-history-2026-10-07.md). Their candidate numbers and pending states are historical.
