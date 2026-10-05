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
full accessibility or M3 acceptance. Auth source `81964951` passes both required
workflows: [Nest37330470647](https://github.com/drrius/nest/actions/runs/37330470647)
and [SwiftUI37330470658](https://github.com/drrius/nest/actions/runs/37330470658).
CI reports496 Foundation cases/41 explicit skips and421 signed-native cases/12
explicit skips, zero failures, strict formatting/source limits and actual signing.

## Actual test-provider refresh

A guarded native SDK method now exchanges the existing fictional member's refresh
token against the real isolated Supabase Auth endpoint. Membership is verified
before and after. A randomized temporary Keychain service holds a copy with a
locally expired lifetime, forcing the normal request-time refresh path. The actual
JWT was not required to expire naturally; that limitation is explicit in the report.

The allowed provider transport records exactly one HTTP200 response. Both tokens
change and the provider session stays the same. The fresh credentials replace the
normal test-member Keychain entry only if the original identity and both credentials
still match; another account/session cannot be overwritten. Reopening the normal
NestAuth reads those exact fresh credentials. No token, password or response body
is attached or exported. Teardown explicitly removes and checks the temporary
Keychain entry; the normal member retains the fresh provider credentials.

The provider method passes in6.178s with zero failures/skips. Subsequent real PDF
download and UI navigation pass in6.037s/20.169s, returning to Today with the original
actor/household,64 empty journals and large/light. All790 captured inputs match;
both scheme signatures/test origins/push-disabled gates and touched formatting pass.
All six complete financial/activity/Storage fingerprints remain unchanged.
[Provider checkpoint](provider-native-verification.json), [retention](provider-fingerprints.json).

The first Mac transfer timed out before any test or credential change. The same
connection later recovered; one fresh sequence executed, with a temporary30-minute
awake process. This is not a repeated refresh or a restart of an unobserved live job.
The new manual fixture has its own pending source CI and skips without explicit
opt-in. Real Apple authentication, natural JWT expiration/revocation, hardware,
offline recovery and complete M3 acceptance remain open; no beta was published.

Supabase documents refresh-token rotation and the parent-token recovery exception
in [User sessions](https://supabase.com/docs/guides/auth/sessions). That is why the
fixture retains the fresh credentials for the normal client rather than restoring
an old snapshot after a successful exchange. No session limits, JWT lifetime,
reuse settings, Auth users or production configuration were changed.
