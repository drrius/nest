# SwiftUI phone acceptance

The available private candidate is **0.1.0/build13**, source `f4a4eb4b3e813c8c6f160823457fe9ea38ffde2c`. Exact-source local archive/export, signed IPA verification and routine/native CI pass. Apple reports build13 VALID and IN_BETA_TESTING internally; the original single submission finished1 October05:29:35 UTC. [Availability evidence](../../evidence/2026-10-01/swiftui-build13/apple-availability.json) records the supported read. Partner tester access and actual physical-phone acceptance remain unverified. This uses **nest-test**, separate from Household OS production. Test entries remain fictional; production balances/history are not copied into this app.

Build13 includes the payment/recurring keyboard corrections, ingredient-review crash fix, recipe-editor safe-gap/Remove/keyboard/binding fixes, fresh recipe detail and Archive, linked preparation and assistant recipe-result links. Use this identified build for the checks below. Check [progress](../progress.md) before judging any tested flow complete.

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

Build13 batches these corrections instead of submitting a beta per UI adjustment. Its archive was built locally on the Mac.

On build13, create one clearly named test recipe with at least one ingredient, edit its instructions and confirm the detail refreshes. Archive that exact test recipe and confirm existing planned meals retain their recipe snapshot. For a clearly named future test meal, open Meal preparation, create a date-only shared task, then edit instructions/responsibility and confirm the partner sees the same task. Reminder consent is separate; preparation is household work and must not post money. Record the actual build and result. Do not infer generated-plan, AI, offline, notification or full accessibility acceptance from those online checks.

## Separate unfinished gates

Live AI is disabled while Gateway eligibility requires a valid card; no purchase is authorized. Notification delivery is disabled pending APNs provider setup and physical delivery verification. A successful permission screen or simulated notification does not satisfy that gate. Complete both-member weekly/approval/offline-conflict/calendar journeys, exact migration reconciliation and owner design acceptance remain required. No result here authorizes production cutover or an App Store release.
