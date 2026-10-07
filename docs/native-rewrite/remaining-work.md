# Remaining acceptance

Updated 7 October 2026. This list sequences the remaining work without changing
the product brief, milestone exits or release gates. Passing dated checks remain
valid within their recorded scope. Repeat them only for affected source changes,
a new failure or an uncovered requirement. M1 through M9 remain open.

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
| Delivery                   | Build22 is internally available; its exact candidate CI/archive/signing pass                                                                                                                      | Actual installation, both-member acceptance and final release checks. Production cutover stays separately gated                                                                                        |
| Merge                      | PR85 previously had green checks and no conversations                                                                                                                                             | Greptile trial limit supplies no approval; specific automatic-review merge rejection remains. No alternate main push bypass                                                                            |

The7 October native reschedule, skip and archive races now have complete queued/
restart/409/exact-discard/partner-read/cleanup evidence with original data
reconciliation. Membership/access-revocation variants and physical-radio
acceptance remain. These bounded results do not close the full daily-use or M4 gates.

Evidence reconciliation7 October:

- [Standalone native contrast diagnosis](../../evidence/2026-10-07/swiftui-native-contrast-probe/README.md) reproduces strict below-bar contrast reports with standard SwiftUI colors, including Nest's hidden bottom fade. The no-tab control keeps identical paragraph frames and removes strict failures. All three diagnostic audits still fail on retained contrast findings. This guides the remaining investigation without clearing Nest's audit, historical above-bar reports, accessibility or phone gates. Do not repeat palette/fade/clipping workarounds for this already reproduced case.

- [Posted PDF and partner browser/download](../../evidence/2026-10-05/swiftui-posted-pdf/README.md#partner-receipt-and-account-boundaries) already establish both fictional identities on one simulator, exact640-byte download and native browser return. Physical phones, live AI handoff and full accessibility remain; do not repeat upload/posting/account switches to clear an obsolete pending statement.
- [Saved portions](../../evidence/2026-10-07/swiftui-saved-portion/README.md) and [planning projection](../../evidence/2026-10-07/saved-portion-planning/README.md) establish actual saved variation/restart/restoration and authorized inputs. Live generated estimates and phones remain.
- [Manual week](../../evidence/2026-10-05/swiftui-native-manual-week/README.md), [ingredient review](../../evidence/2026-10-05/swiftui-native-ingredient-review/README.md), [preparation](../../evidence/2026-10-06/swiftui-native-preparation/README.md) and [completion](../../evidence/2026-10-06/swiftui-native-preparation-completion/README.md) supersede those records' earlier pending move/edit/preparation notes within their stated scope. Live proposals, complete losses/conflicts, accessibility and phones remain.
- [Direct variable bill](../../evidence/2026-10-04/swiftui-native-variable-bill/README.md) already proves native posting and recorded restart/client-update recovery. [Hosted lost-reply recovery](../../evidence/2026-10-07/swiftui-variable-bill-lost-reply/README.md) now proves one committed POST, offline restart/local discovery, receipt-only recovery, Done, partner SDK read and retained history. [Controlled native cancellation restart](../../evidence/2026-10-07/swiftui-variable-bill-cancellation/README.md) proves local command/flag preservation and recorded-versus-cancelled recovery. [Hosted cancellation reply recovery](../../evidence/2026-10-07/swiftui-variable-bill-cancel-reply/README.md) now proves the real dialog, lost cancellation reply, exact restart/retry, Continue and no financial posting. Save/cancel races, live AI handoffs and phones remain uncovered; the distinct retained-draft journey does not prove those variants.
- [Keyboard diagnosis](../../evidence/2026-10-07/swiftui-keyboard-toolbar-probe/README.md) attributes the warning to native InputAccessoryBar on the tested runtime. Actual keyboard usability/phone acceptance remains; removing useful controls merely to suppress that warning is not a requirement.

Work order:

1. Finish remaining local UI/runtime and financial recovery gaps. Keep one source
   candidate stable until its CI jobs finish. Avoid further per-detail beta builds.
2. Use available consolidated build22 and the existing phone checklist
   to gather both partners' acceptance. Prepare another beta only for necessary
   shipping changes; test-only or evidence updates do not need a beta.
   Do not count simulator evidence as phone
   acceptance or turn broad gates into individual passing screenshots.
3. When the existing AI/credential blockers change, verify the actual provider and
   scheduled delivery. The read-only scheduled-writer inventory is now prepared
   and fixture-tested; hosted inventory still needs separately authorized access.
   Continue remaining migration/read-only work while they remain blocked.
4. Reconcile every milestone exit against its evidence before claiming completion.
   Production migration, retirement and public release require separate approval.

The progress log records detailed evidence and exact blocker history. This list
does not authorize purchases, production mutation, new invitations or previously
rejected secret transfers. The removed continuation automation stays removed.

Earlier dated checkpoints are preserved in [remaining-work history](remaining-work-history-2026-10-07.md). Their candidate numbers and pending states are historical.
