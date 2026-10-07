# SwiftUI phone acceptance

The available private candidate is **0.1.0/build 23**, frozen source
`9ecfdca2c66c98dae0df9d906a088c56a42580dc`. Its exact-source routine and native CI,
signed Mac archive/export and copied IPA hash checks pass. One private submission
finished on 7 October; Apple confirms build 23 VALID, IN_BETA_TESTING and unexpired.
[Release evidence](../../evidence/2026-10-07/swiftui-build23/README.md).
Partner tester access and physical-phone acceptance remain unverified. It uses
**nest-test**, separate from Household OS production. Production balances/history
are not copied into this app.

Build 23 includes the shared four-tab headers/insets and Quiet Calendar cards,
recipe/preparation flows, preferences, renewals/reminders and financial review
controls. It also includes grocery spoken quantities/sync states, local variable-
bill recovery discovery and Today action-label styling. Start with the
[short build 23 pass](build23-first-phone-pass.md), then this checklist.
Live AI and scheduled delivery remain unverified. Source/simulator/CI results do
not establish either phone's acceptance. Build 23 includes the later Money history spacing, meal-cache/privacy and picker
target fixes, with bounded simulator evidence. Their physical-phone acceptance
remains open.

Before updating an older installed Nest build, reconnect it and synchronize any pending chore/grocery checks. Do not delete the installed app to fix a sign-in error: that can discard a local pending command. If it has unresolved pending changes, stop the update and report the visible message.

## First phone pass

These are checks for both partners to complete independently. Record phone/iOS, build number, result and any screenshot beside each item. A pass on one phone does not establish the other phone.

1. Open the identified build in TestFlight and sign in with the existing Apple account. Confirm your own profile and household. If account verification fails, report the message; do not create replacement accounts or use someone else’s session.
2. Complete optional quick start, then open Today, Meals, Calendar and Money. Open Ask and Profile and return. Try light/dark appearance and your preferred larger text size. Report clipped controls, confusing labels, unexpected blanks or loading errors.
3. Add one clearly named test grocery online. On the other phone, refresh and confirm it appears. With the loaded list and signed-in session, disconnect one phone, check that item, force-quit/reopen, then reconnect. Confirm the pending status survives and the other phone sees one check without an expense. Repeat with one test chore. Report conflicts; never silently discard a pending intent.
4. Place one clearly named test meal online, open its details, move it to another empty slot, and confirm the partner sees the change. Confirm removal identifies the exact meal. Review the weekly plan and recipe/library layout with the keyboard and large text. Live AI planning is still unavailable, so this does not close generated-plan acceptance.
5. Draft a CHF 1.01 expense and review the displayed amount and split. Return through Edit and confirm the draft is retained. The first pass can stop before Save; it does not prove financial posting or approvals. Separate isolated-household acceptance must cover actual save, partner decisions, corrections, settlements and recurring rules.
6. Open Calendar and choose whether to grant permission. Personal events should stay on your phone. Busy sharing starts off and requires an explicit enable action; only times may be shared. Declining permission must leave the other tabs usable. Two-phone sharing/revocation and payload inspection are separate checks; the basic permission screen is not privacy acceptance.
7. Open Profile and confirm settings are readable and navigation returns safely. Test VoiceOver and Reduce Motion if available, including keyboard controls and larger text. Report what was actually exercised.

## Recipe and preparation checks

Build 23 includes the recipe/preparation flows and preparation-readability fixes. Its archive was built locally on the authorized Mac. The later meal-cache fixes are included; simulator results do not establish phone acceptance.

On build23, create one clearly named test recipe with at least one ingredient, edit its instructions and confirm the detail refreshes. Archive that exact test recipe and confirm existing planned meals retain their recipe snapshot. For a clearly named future test meal, open Meal preparation, create a date-only shared task, then edit instructions/responsibility and confirm the partner sees the same task. Reminder consent is separate; preparation is household work and must not post money. Record the actual build and result. Do not infer generated-plan, AI, offline, notification or full accessibility acceptance from those online checks.

## Financial candidate checks

These changes are in **build23**, with implementation and bounded verification. Actual phone acceptance remains open; do not infer a completed journey from current source or CI. Use clearly marked fictional entries in nest-test only. Record each phone/build/result and keep unresolved saved decisions intact.

- Review a private variable-bill proposal's exact CHF amount, payer, two shares and due period. Merely opening it, returning from background or refreshing must not record it. Explicitly confirm one proposal and decline another, then check the matching immutable result. Do not use an ordinary bill form as a substitute for a private approval.
- During review, have the other partner change the bill revision or cover that same cycle using a separate explicit test action. The old proposal must refuse confirmation and permit explicit decline or a fresh proposal. A saved uncertain decision must first resolve its exact recorded or unused result; do not discard it based only on a message or local clock.
- To link an existing test expense, open its recurring rule and choose Link existing expense. Review the original expense and rule separately, including any difference in amount, payer or split. Explicit confirmation must cover one period while leaving the number of expenses and both balances unchanged. Both phones should observe the same covered cycle after refreshing. Check older history pages where applicable.
- After an interrupted confirmation or cancellation, reopen the app and check the saved exact result before trying another entry. If already recorded, cancellation must preserve the receipt/history. Financial initiation needs an online fresh review; a disconnected phone must not silently queue a new financial approval or link. Report the exact state rather than deleting the app or saved intent.

Private manual-link proposal cards are in build23 and pass exact-source native CI; complete rendered/two-phone acceptance remains open. Direct/private legacy dismissal now pass exact-source native CI; rendered/two-phone acceptance remains pending. Legacy confirmation/adoption forms and private proposal destinations in build23 have implementation and bounded Mac/backend/CI verification; they require hosted/phone acceptance. Full financial phone acceptance also includes expenses, refunds, reversals/replacements, settlements, rule creation/edit/state/resumption, approval privacy across the two members and repeated requests without duplicate posting. These focused checks do not close that full gate.

## Retained-history checks

These native readers are in **build23**. On build23, open Money → Recurring expenses → Retained recurring expenses. An empty successful list means there are no migrated test rules; it does not verify the populated workflow. Populated acceptance needs safe fictional migration fixtures prepared separately in nest-test.

For those fixtures, each partner should see the same retained rules and original drafts. A later rule edit must not replace the draft's original amount, payer, split or date. Pending, posted and dismissed states stay distinct; a linked entry opens authorized financial history. Unsupported values or status/entry discrepancies should show review messages. Opening, returning, refreshing and reading later pages must create no expense or automatic mandate. Disconnect and retry online; failed reads must not appear as a successful empty history. Record actual build/result. On build23 with safe populated fixtures, review one pending recurring unlinked draft for dismissal. Merely opening or refreshing must change nothing; explicit dismissal must retain the history, create no expense/payment, leave balances unchanged and not pause/cancel the old rule. Review a private dismissal proposal separately; only its owner may open it. A changed or expired proposal may be declined but cannot confirm changed terms. If interrupted, recover the exact receipt or explicitly cancel/withdraw; do not delete uncertain intent. A previously recorded dismissal wins over later cancellation. These implemented dismissal paths still need actual rendered/two-phone results. Confirmation, opt-in and their private decisions now have implementation and bounded verification, with hosted/phone acceptance still required.

## Reminder touch controls

On the identified candidate, open an existing chore through Manage chores and
Scheduled chores, then Reminder choices. In an unsaved draft, enable the reminder
and try incrementing and decrementing Days before near the top and bottom edges
of the controls. Check normal and larger text sizes. Each tap should change the
value once. Discard the draft through Back; do not Save during this touch check.
Report missed or double taps. Simulator bounds and automation do not establish
physical-phone touch or VoiceOver acceptance.

Build 23 includes the explicit44-point reminder adjustment buttons. Record the
installed build and physical result. The renewal-row44-point actions, explicit removal Cancel and the largest-text
recurring-rule row fix are also included in build23.

## Separate unfinished gates

Live AI remains unavailable after Gateway returned `customer_verification_required`; a card alone has not established eligibility. Finish any account-verification prompt and report that eligibility changed before a bounded retry. No purchase is authorized. Notification delivery is disabled pending APNs provider setup and physical delivery verification. A successful permission screen or simulated notification does not satisfy that gate. Complete both-member weekly/approval/offline-conflict/calendar journeys, exact migration reconciliation and owner design acceptance remain required. No result here authorizes production cutover or an App Store release.
