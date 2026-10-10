# Quiet UI correction audit — 27 September 2026

Historical Expo/React Native correction notes. The later [SwiftUI decision](../adr/0002-swiftui-client.md) supersedes client-specific implementation/tooling details here. Current native evidence, remaining visual gates and build identity are in [progress](../progress.md) and the [artwork inventory](artwork-inventory.md). The owner’s design acceptance remains open; the old Linux/EAS limitations below do not describe current SwiftUI CI or prior owned Mac execution.

Status: **native visual acceptance failed and remains open**. The owner rejected Today and then the welcome/account screen on a physical iPhone. Neither the previous source review nor a successful build establishes design fidelity.

## Baseline and evidence

The authoritative direction is `prototypes/index.html` and `product-and-design.md`. The prototype was reopened and visually inspected in the browser during this pass. It uses open checklist rows, restrained 16-point section labels, a prominent page title, full-width rounded-rectangle primary actions, soft secondary actions, and very few filled surfaces. Its fictional data is not a substitute for populated native screens.

The latest owner screenshot shows the authenticated welcome branch: technical verification copy, two weak text links, a prominent sign-out pill, and an oversized enclosing card. This pass removes that composition rather than merely changing its colors.

## Corrections implemented in this pass

| Surface         | Correction                                                                                                                                                                       | Verification still required                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Shared actions  | Rounded rectangle, minimum 48-point target, wrapping label, pressed/disabled feedback; secondary by default; primary actions explicitly selected                                 | All affected native layouts, large text, VoiceOver, loading/disabled states |
| Welcome/account | Open composition, display headline, clear Get started and Set up everything hierarchy; quiet sign-out; same container through loading, missing configuration and logout recovery | Apple sign-in, ready/offline/nonmember/error/logout branches on iPhone      |
| Setup           | Concise grouped destination rows with genuine saved/unknown status; privacy explanations retained at the feature forms                                                           | Independent member setup, every destination, offline/error states           |
| Settings        | Personal, household and account groups; whole-row navigation instead of repeated card/button stacks                                                                              | Back navigation, long names and large text                                  |
| Tab headers     | Native stack titles retained; labeled 44-point assistant/profile symbol controls                                                                                                 | Actual iOS header arrangement and VoiceOver                                 |
| Today chores    | Continuous checklist rows and separators; section spacing independent of row spacing                                                                                             | Populated, empty, pending and conflict states; completion feedback          |
| Meals           | Flexible prominent planning action, secondary overflow; explicit proposal generate/approve versus discard/reload hierarchy                                                       | Full week, all slots, proposal/recovery and long meal names                 |
| Groceries       | Quiet grouping/show-checked/retry controls; explicit primary add/save                                                                                                            | Inline keyboard, pending/conflict/checked cases                             |
| Money           | Open balance typography matching prototype, primary expense and soft settlement actions; explicit expense review CTA                                                             | Real balance/history, long CHF values, keyboard and receipt states          |

No authentication, authorization, financial write rules or retry identities were changed. No new artwork was needed for these structural corrections; functional symbols use the native icon library.

## Review findings addressed

The first source review found that the global button default would make hundreds of actions primary, that chore item gaps prevented a continuous list, and that welcome early returns retained the old card. All three were corrected before the next review. Code review is not visual sign-off.

## Remaining visual acceptance work

- Render the actual native app, not a separately written HTML facsimile. EAS Simulator availability was checked again and reports `available: false`; this Linux host cannot run Xcode.
- Obtain a reachable Mac/Xcode simulator or run the candidate on an iPhone. A Mac SSH hostname was requested; no credentials should be posted in chat.
- Compare welcome, Today with real chores/meals, a full meal week and proposal, groceries, Calendar with personal/busy-only events, Money, expense with keyboard/receipt, private chat/approval, setup and settings against the approved baseline.
- Inspect light/dark, large text, VoiceOver, empty/loading/error/offline/recovery states. Record screenshots with build/source identity and distinguish rendering from actual interaction checks.
- Calendar, private conversation, detailed preference/recurring/renewal forms and secondary record screens have **not** received native visual acceptance. Source edits to shared primitives do not close those gaps.
- Do not issue another claim of a completed Quiet pass or ask the owner to install another replacement solely because lint, types, review and build are green.
