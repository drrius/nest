# What remains before Nest is finished

Updated 4 October 2026. SwiftUI is the selected client. Most everyday surfaces exist, but every full milestone acceptance gate remains open. This list groups remaining work by outcome rather than commit or test count. Detailed evidence and exact blockers stay in [progress](../progress.md).

## 1. Finish the retained financial flows

- [ ] Finish direct draft-to-expense conversion: source and focused Mac/database tests pass; routine CI and fictional keyboard/review/cancel rendering now pass. Full native CI now also passes; saved recovery rendering and hosted/phone journeys remain.
- [x] Implement private AI draft-confirmation review and exact decision/withdrawal recovery. Focused Mac/backend checks and fictional review/alert rendering pass. Offline recovery discovery/isolation tests also pass; both required workflows pass at `886773cc`, and hosted/provider/phone acceptance remains open.
- [x] Implement direct recurring-rule adoption with explicit fresh terms and prospective consent. Focused Mac/backend and actual fictional variable-form checks pass; both required CI workflows pass; fixed-form/recovery rendering and hosted/phone acceptance remain.
- [x] Implement private AI recurring-rule adoption review and exact decision recovery. Focused Foundation/native/backend checks and fictional review/cancel rendering pass; native and corrected routine CI pass; hosted/provider/phone acceptance and recovery rendering remain pending.
- [ ] Verify complete financial history, approvals, membership changes and uncertain retries with both members.

Existing balance/history, ordinary expenses, refunds/corrections, settlements, recurring controls and retained-draft dismissal have implementation and bounded verification. That does not close the items above.

An actual native ordinary-expense save/review/edit/detail/restart journey now passes against fictional test data. Both members see exactly one event with correct zero-sum balances, while the operation receipt stays private to its owner. This closes that bounded check; it does not close full approvals, uncertain retries or both-phone acceptance. [Evidence](../../evidence/2026-10-03/swiftui-native-expense-journey/README.md).

## 2. Finish native usability and real-data acceptance

- [ ] Review populated, empty, loading, error and keyboard states across Today, Meals, Calendar and Money, plus onboarding/settings and private assistant destinations.
- [ ] Verify large text, VoiceOver, navigation, motion settings and the approved Quiet appearance; fix findings.
- [ ] Complete two-member offline/restart/conflict journeys, meal planning/constraints, chores/handovers, calendar privacy and longer background/reconnection behavior.

Selected rendered simulator checks already pass, including the revised four-tab roots at normal and largest text, expense/payment/date-picker navigation, and full-history entry/read-refresh corner targets. Full-history pagination, complete keyboard/error/recovery states, phone and owner design acceptance remain required. Build14 now contains the latest batch and is internally available. The immediate priority is phone acceptance plus remaining native/hosted checks.

Grocery add/checkbox/edit recovery now has bounded real hosted and owned native proof. New edits remain online; typed fields survive refusal and explicit partner reload. A committed edit with a dropped reply survives process restart and a UI update, and exact retry returns the same receipt. Removed checks retain their intent until explicit discard. Native symbol actions and recovery buttons pass44pt corner taps, including largest-text/dark Add cancellation. Both new fictional fixtures were removed normally, money is unchanged, and the stable-origin app/ordinary Today is restored with empty journals, preserved Keychain/data, stopped relay and destroyed generated key. Earlier checkbox compatibility/opposing cases and expense-shortcut switch/back are also verified. [Current evidence](../../evidence/2026-10-04/swiftui-grocery-rendered-edit/README.md). Current source `6ccb5d5a` passes both routine and native CI. Both-phone, VoiceOver, haptics, actual radio loss and complete chores/handovers/financial acceptance remain open. These corrections are newer than build14.

## 3. Prove live integrations

- [ ] Resolve AI Gateway eligibility and verify real streaming/tools and approval handoffs. Last actual call failed403; successful fixture execution is not live AI proof.
- [ ] Complete explicitly authorized test-worker credential configuration and activation. The compatible test API is deployed and passes read-only member/isolation checks. A specific worker server-secret transfer approval question remains pending; API deployment and worker activation are separate steps.
- [ ] Configure Apple push provider credentials, test worker behavior, enroll both phones and verify all six notification kinds. Push is currently disabled.
- [ ] Reconcile remaining test-environment security/external-writer checks and safe populated legacy fixtures.

Continue independent native work while these inputs are unavailable. Do not purchase services or modify production to clear a test blocker.

## 4. Deliver and accept a current private build

- [x] Batch the verified changes into a current signed TestFlight candidate. Build14, exact source `bded62ec`, passes both CI workflows, native archive/export/package checks and supported internal Apple availability. Partner access and actual phone acceptance remain unverified.
- [ ] Verify installation/sign-in and complete the [phone checklist](swiftui-phone-acceptance.md) with both partners; resolve findings.
- [ ] Rehearse current-chain migration/reconciliation and old pending-intent drainage safely.
- [ ] Prepare a reviewable cutover package. Production migration, retirement and public release remain separate owner decisions.

There is no reliable percentage or completion date until these outcomes are verified. Unit-test totals and source coverage do not establish that the app is finished.
