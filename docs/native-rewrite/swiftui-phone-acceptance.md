# SwiftUI phone acceptance

The next private candidate is 0.1.0/build11, source `d4981cbef686933a644444d8a87a8b56a8dd1bdb`. Exact-source local archive/export, signed IPA verification and routine/native CI pass. Apple upload/availability is pending. Check the current state in [progress](../progress.md) before installing. This uses **nest-test**, separate from Household OS production. Test entries remain fictional; production balances/history are not copied into this app.

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

## Separate unfinished gates

Live AI is disabled while Gateway eligibility requires a valid card; no purchase is authorized. Notification delivery is disabled pending APNs provider setup and physical delivery verification. A successful permission screen or simulated notification does not satisfy that gate. Complete both-member weekly/approval/offline-conflict/calendar journeys, exact migration reconciliation and owner design acceptance remain required. No result here authorizes production cutover or an App Store release.
