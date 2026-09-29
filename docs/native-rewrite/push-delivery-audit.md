# Native push delivery boundary

Audited 23 September 2026 against the approved native architecture and these legacy sources:

- `/home/drrius/Work/household-os/supabase/functions/_shared/push-delivery-policy.ts`
- `/home/drrius/Work/household-os/supabase/functions/_shared/push-dispatch-delivery.ts`

The legacy adapter is Web Push/VAPID, using `@pushforge/builder` and HTTP subscription endpoints. It is not an Expo/APNs adapter and must not be copied into Nest. Its HTTP 2xx classification means Web Push acceptance, not device presentation. Nest must separately persist Expo tickets and receipts and never label acceptance as confirmed display.

Useful audited behavior to retain conceptually: do not resend to device registrations already accepted; defer missing/invalid configuration; cap transient retries; disable invalid registrations; preserve per-device outcomes across partial success. No legacy code was copied in this audit.

## Native implementation constraints

Device registration belongs to the authenticated member and household, with a random installation identity stored locally. Registration/rotation needs revision protection and operation recovery, and sign-out must disable the old association. Tokens must never appear in household reads, AI tools, transcripts, generic logs or notification content. A token moving between accounts cannot remain active for both.

Delivery identity includes the existing outbox occurrence and the exact device-registration revision. A worker must recheck current membership, recipient mute state, item revision, schedule revision, due time and active device revision before sending. Claim acquisition alone is insufficient authority after a later mute or edit. Worker credentials remain server-only and hosted activation remains separate from source merges.

External push sending cannot share a PostgreSQL transaction. Preserve the distinction between known rejection, accepted ticket, confirmed receipt and unknown network outcome. An unknown send outcome must not be described as delivered or silently retried as though it definitely failed. APNs/device presentation remains inherently unverified by a ticket or receipt.

Payloads should contain a generic Nest notification message and strictly validated routing identity. They must exclude private calendar text, private conversation content and financial amounts from lock-screen previews. The app must verify the current account and fetch authorized content after opening the link, including cold start.

## Current evidence and gaps

Nest currently has notification preferences and renewal reminder native/AI commands. The scheduling branch has private due-time, candidate and outbox primitives with synthetic PostgreSQL tests. The working tree now pins `expo-notifications@57.0.19` and includes a permission/token adapter connected to explicit notification-settings controls. The registration controller has local tests, but native interaction is unverified. There is no Expo transport, ticket/receipt worker or active hosted scheduler yet. No push was sent, no hosted migration applied, and no device acceptance is claimed.

## Delivery authorization and uncertainty

The private delivery candidate uses a single occurrence/installation row with a captured registration revision. Preparing it does not release a token. Beginning delivery rechecks reminder/item revisions, recipient preferences/membership, device ownership/revision, session existence/expiry and explicit Nest session revocation. Only one begin succeeds. Its transaction is the authorization point; a later external request cannot share the database transaction or retract a notification already accepted by a provider.

A crashed or lost begin/send response must stay uncertain rather than returning to ready automatically. A known provider rejection may later permit a bounded retry under fresh authorization; an accepted ticket requires receipt tracking. Expo distinguishes ticket acceptance from provider receipt acceptance, recommends checking receipts after 15 minutes and removes receipts after 24 hours: [Expo send documentation](https://docs.expo.dev/push-notifications/sending-notifications/). Neither is evidence that the user saw a notification.

Session validation checks `auth.sessions.id`, `user_id` and nullable `not_after`, alongside Nest's explicit revocation fence. Supabase documents that session-policy checks run at refresh rather than proactively destroying every session: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions). Hosted Auth configuration and actual schema remain acceptance checks; local tests use a declared minimal synthetic Auth session table.

## SwiftUI APNs replacement, 30 September 2026

ADR 0002 replaces Expo enrollment/delivery with UserNotifications/APNs in the SwiftUI client. The existing Expo adapter and registration/delivery SQL remain historical working backend code pending an audited transition; they cannot receive an APNs token safely. The new server-only APNs adapter has focused actual loopback HTTP/2 and temporary-key checks, but is not connected to enrollment, scheduling or worker persistence yet. No push was sent through Apple.

The adapter pins Nest's topic and Apple sandbox/production HTTPS HTTP/2 origins, binds each signer to its configured environment, reuses its connections and provider JWT, and constructs generic alert content with validated existing routing fields. Keys/provider tokens remain server-only and redacted. Variable-length device bytes are represented by bounded canonical hexadecimal strings. Timeout, cancellation, disconnection and malformed responses stay uncertain; the adapter never resends automatically. APNs HTTP 200 means provider acceptance, with no Expo ticket or subsequent Expo receipt poll. Database integration must preserve the exact attempt/registration revision and these semantics rather than fabricate a delivery receipt. A 410 timestamp must be compared to the relevant current registration before disabling it; a delayed rejection must not disable a newly registered token.

Protocol sources consulted: Apple's [notification requests](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns), [token-based connections](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns) and [notification responses](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns). These specify HTTP/2/TLS, ES256, provider-token refresh intervals, variable device tokens, response identity and status semantics. Tests prove local protocol behavior, not Apple credential validity or physical-iPhone delivery.

The subsequent local enrollment migration adds provider/environment-bound registrations while keeping legacy Expo command digests and immutable receipts valid. It preserves fresh revision checks, cancellation and session fencing. APNs registrations expose no token through read/recovery or AI and cannot be claimed by the legacy Expo begin path: the guard returns no attempt and leaves the delivery ready. Disposable PostgreSQL and HTTP tests verify this boundary. Neither hosted schema has received this migration; replacing that guard requires an APNs worker with exact provider-specific outcome persistence, not merely a transport adapter.
