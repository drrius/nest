# Native push delivery boundary

Current status, 7 October 2026: the shipping client uses SwiftUI,
UserNotifications and APNs under [ADR 0002](../adr/0002-swiftui-client.md).
No Expo client, SDK or notification dependency remains. The
[worker runbook](push-worker-runbook.md) describes current server configuration
and acceptance requirements. Registration and worker source have bounded native,
database and protocol evidence; real Apple delivery is still unverified. The
test worker remains disabled pending server configuration and APNs credentials.
Build 23 does not enable push. The dated audit below preserves earlier decisions
and does not authorize restoring Expo or activating a scheduler.

Audited 23 September 2026 against the approved native architecture and these legacy sources:

- `/home/drrius/Work/household-os/supabase/functions/_shared/push-delivery-policy.ts`
- `/home/drrius/Work/household-os/supabase/functions/_shared/push-dispatch-delivery.ts`

The legacy adapter is Web Push/VAPID, using `@pushforge/builder` and HTTP subscription endpoints. It is not an APNs adapter and must not be copied into Nest. Its HTTP 2xx classification means Web Push acceptance, not device presentation. Nest persists provider-specific outcomes and never labels acceptance as confirmed display. APNs has no delivery-receipt polling API; retained Expo compatibility paths have separate ticket/receipt semantics.

Useful audited behavior to retain conceptually: do not resend to device registrations already accepted; defer missing/invalid configuration; cap transient retries; disable invalid registrations; preserve per-device outcomes across partial success. No legacy code was copied in this audit.

## Native implementation constraints

Device registration belongs to the authenticated member and household, with a random installation identity stored locally. Registration/rotation needs revision protection and operation recovery, and sign-out must disable the old association. Tokens must never appear in household reads, AI tools, transcripts, generic logs or notification content. A token moving between accounts cannot remain active for both.

Delivery identity includes the existing outbox occurrence and the exact device-registration revision. A worker must recheck current membership, recipient mute state, item revision, schedule revision, due time and active device revision before sending. Claim acquisition alone is insufficient authority after a later mute or edit. Worker credentials remain server-only and hosted activation remains separate from source merges.

External push sending cannot share a PostgreSQL transaction. Preserve the distinction between known rejection, accepted ticket, confirmed receipt and unknown network outcome. An unknown send outcome must not be described as delivered or silently retried as though it definitely failed. APNs/device presentation remains inherently unverified by a ticket or receipt.

Payloads should contain a generic Nest notification message and strictly validated routing identity. They must exclude private calendar text, private conversation content and financial amounts from lock-screen previews. The app must verify the current account and fetch authorized content after opening the link, including cold start.

## Historical Expo snapshot, 23 September 2026

At this earlier checkpoint, Nest had notification preferences and renewal reminder native/AI commands. The scheduling branch had private due-time, candidate and outbox primitives with synthetic PostgreSQL tests. The then-current Expo client pinned `expo-notifications@57.0.19` and included a permission/token adapter connected to explicit notification-settings controls. Registration had local tests, with no verified native interaction, transport/receipt worker, active scheduler or hosted migration. That client and dependency were subsequently removed; this paragraph is historical evidence.

## Delivery authorization and uncertainty

The private delivery candidate uses a single occurrence/installation row with a captured registration revision. Preparing it does not release a token. Beginning delivery rechecks reminder/item revisions, recipient preferences/membership, device ownership/revision, session existence/expiry and explicit Nest session revocation. Only one begin succeeds. Its transaction is the authorization point; a later external request cannot share the database transaction or retract a notification already accepted by a provider.

A crashed or lost begin/send response must stay uncertain rather than returning to ready automatically. A known provider rejection may later permit a bounded retry under fresh authorization. The retained Expo compatibility path tracks accepted tickets and later receipts. The shipping APNs path records provider acceptance, rejection or uncertainty without receipt polling. Neither provider acceptance nor a legacy receipt proves that the user saw a notification.

Session validation checks `auth.sessions.id`, `user_id` and nullable `not_after`, alongside Nest's explicit revocation fence. Supabase documents that session-policy checks run at refresh rather than proactively destroying every session: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions). Hosted Auth configuration and actual schema remain acceptance checks; local tests use a declared minimal synthetic Auth session table.

## SwiftUI APNs replacement, 30 September 2026

Current follow-up: native enrollment/logout and protected notification opening are implemented with focused simulator evidence. APNs registration/outcome and later-journal barriers are installed on the isolated test project after full-chain rehearsal; the Swift hosted register/replay/cancel/disable test passes. No active token, provider attempt, worker or cron job remains. [Installation and exact boundaries](nest-test-setup.md) supersede the earlier local-only status below. No real Apple notification or physical-phone acceptance is claimed.

ADR 0002 replaces Expo enrollment/delivery with UserNotifications/APNs in the SwiftUI client. The existing Expo adapter and registration/delivery SQL remain historical working backend code pending an audited transition; they cannot receive an APNs token safely. The new server-only APNs adapter has focused actual loopback HTTP/2 and temporary-key checks, but is not connected to enrollment, scheduling or worker persistence yet. No push was sent through Apple.

The adapter pins Nest's topic and Apple sandbox/production HTTPS HTTP/2 origins, binds each signer to its configured environment, reuses its connections and provider JWT, and constructs generic alert content with validated existing routing fields. Keys/provider tokens remain server-only and redacted. Variable-length device bytes are represented by bounded canonical hexadecimal strings. Timeout, cancellation, disconnection and malformed responses stay uncertain; the adapter never resends automatically. APNs HTTP 200 means provider acceptance, with no Expo ticket or subsequent Expo receipt poll. Database integration must preserve the exact attempt/registration revision and these semantics rather than fabricate a delivery receipt. A 410 timestamp must be compared to the relevant current registration before disabling it; a delayed rejection must not disable a newly registered token.

Protocol sources consulted: Apple's [notification requests](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns), [token-based connections](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns) and [notification responses](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns). These specify HTTP/2/TLS, ES256, provider-token refresh intervals, variable device tokens, response identity and status semantics. Tests prove local protocol behavior, not Apple credential validity or physical-iPhone delivery.

The subsequent local enrollment migration adds provider/environment-bound registrations while keeping legacy Expo command digests and immutable receipts valid. It preserves fresh revision checks, cancellation and session fencing. APNs registrations expose no token through read/recovery or AI and cannot be claimed by the legacy Expo begin path: the guard returns no attempt and leaves the delivery ready. Disposable PostgreSQL and HTTP tests verify this boundary. Neither hosted schema has received this migration; replacing that guard requires an APNs worker with exact provider-specific outcome persistence, not merely a transport adapter.

The local APNs outcome migration and worker now bind a separately configured environment before claim, retain immutable attempt/registration metadata, recheck the existing six-kind authorization and store exact provider acceptance, rejection or uncertainty. A delayed invalidation is fenced by current revision/environment/provider and registration time. Legacy ticket/receipt RPCs cannot consume an APNs attempt. Fifteen final local checks include real PostgreSQL/PostgREST and loopback HTTP/2 with temporary keys; they preserve a nonempty fictional financial ledger. This is local integration evidence only. Hosted migrations, scheduling/cycle integration, real credentials, native permission/token/logout lifecycle and protected links are still incomplete, and no Apple notification was sent.
