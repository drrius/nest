# Credential refresh ordering — 5 October 2026

A controlled native test reproduces two failures in the pinned Supabase Swift SDK
through the original NestAuth boundary: a refresh held at the transport can return
later and restore credentials after local sign-out, or overwrite the newly signed-in
account. Both initial cases fail. The final gated regression scenarios also fail
with the original NestAuth: zero passes, two failures/skips zero, Xcode65,30.863s.
This proves a credential ordering defect; it does not prove the cause of the earlier
multiple-client operator fixture mismatch was identical.

NestAuth now serializes owned session/cached reads, sign-in and sign-out through
one shared operation queue. Credential writes finish in order even when the caller
is interrupted. The production SDK timer is disabled: normal session() calls still
refresh expired credentials at request time, within that same queue. Idle/background
SDK tasks cannot race those writes. Existing push-cleanup helpers run within the
current operation rather than recursively acquiring the queue.

The new native regression tests hold the actual SDK refresh response, start the
credential change, verify its transport has not overtaken that refresh, then release
it. Final real Keychain/session assertions require sign-out to remain cleared and
the new account to remain current. Responses and identities are explicitly synthetic;
the SDK and iOS Keychain execute natively. This is not Apple-auth or hosted refresh
proof. Each test uses a separate randomized service, never the normal app credential.

The two regression methods plus five existing push-auth cases, expired/offline
logout recovery and nine session/account-isolation cases pass:17 native tests,
zero failures/skips,20.571s. Existing tests also cover failed operations releasing
the queue, retained revocation intent, restart, same-actor replacement and credential
mutation ordering. No database schema or financial command changed.

A separate signed real-API smoke verifies the original fictional member still
reads/downloads the exact existing PDF and navigates its history/detail/receipt
control back to Today. Signature, stable test origins, push disabled, original
scope,64 empty journals and large/light restoration are verified independently.
The actual download/navigation methods pass in6.343s/18.887s with zero failures
or skips. All789 captured inputs match the Mac and Linux; the six complete
financial/activity/Storage fingerprints remain exact. See the [native checkpoint](native-verification.json)
and [retention comparison](retained-fingerprints.json). These
bounded checks do not establish both phones, Apple sign-in, all SDK failure modes,
full accessibility or M3 acceptance. New-source CI remains pending until pushed.
