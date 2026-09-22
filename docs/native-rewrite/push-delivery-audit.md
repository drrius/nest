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
