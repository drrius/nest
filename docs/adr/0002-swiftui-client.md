# ADR 0002: SwiftUI iPhone client

Accepted 27 September 2026. The owner explicitly chose a full SwiftUI client rewrite after reviewing the standalone Quiet Today study. This supersedes ADR 0001 and the product brief **only where they require Expo/React Native or Effect v4 in the client**. The product scope, Quiet direction, privacy and financial rules, backend architecture and verification gates remain in force.

## Decision

Build a fresh iPhone app in `apps/ios` with SwiftUI and Apple frameworks. Port Today, Meals, Calendar, Money, onboarding/settings and private assistant end to end, one complete vertical slice at a time. The existing React Native app is temporary reference material; remove its app, Expo configuration and client-only dependencies once the replacement meets the accepted flows. Do not carry over mock screens or entire legacy implementations. Preserve the working backend, Supabase data/RLS, Effect v4 services and Vercel AI SDK server orchestration. Swift uses typed Codable contracts and structured concurrency at the client boundary; cross-language contract tests must detect drift from the server's Effect schemas. UI and AI continue to use the same authorized server commands.

The SwiftUI app uses Apple Sign In and a verified Supabase session, URLSession transport, Keychain for credentials, SQLite for limited offline snapshots/commands, EventKit for on-device calendar reads, and UserNotifications/APNs for push. These are implementation directions, not evidence of working integrations. Keep secrets out of the app bundle. Money and AI remain online-only. Offline chore completion and grocery checks retain operation identity, cutover epoch, explicit conflict recovery and account isolation.

The current Expo build remains available during the port but does not satisfy SwiftUI client acceptance. The SwiftUI target keeps bundle ID `ch.drrius.nest` so Apple Sign In presents the already configured audience. Local Xcode simulator builds are the development route. Before replacing an installed Expo build on a phone, drain or explicitly reconcile its pending offline operations; source-code removal must not silently discard user intent. TestFlight signing, distribution and final phone acceptance are separate gates; no build, merge or test automatically authorizes production migration, service purchase, old-app retirement or public publication.

## Consequences

This is a substantial client rewrite. Existing backend, database, domain tests and financial history are reused deliberately; React Native UI tests do not prove SwiftUI behavior. Reverify authentication, authorization, tenant isolation, offline retries/conflicts, calendar privacy, financial approvals, AI handoffs, accessibility, large text and both-member phone journeys in the new client. The M0–M9 checklist retains its product exit criteria, with SwiftUI evidence required for every client-specific gate. A screenshot of fictional data remains a design study, not a vertical slice.
