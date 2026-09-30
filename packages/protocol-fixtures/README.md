# Protocol verification fixtures

This private, unexported package retains the framework-independent adapters and meaningful tests audited during removal of the React Native client. Its source is reachable from retained tests or backend integration fixtures; the original paths and hashes are recorded in the [file audit](../../evidence/2026-09-30/react-native-removal/tracked-file-audit.csv). Unreachable screen code, hooks, routes and artwork were removed.

These checks exercise authorized HTTP/Effect contracts, integer financial allocations, private approvals, account isolation, durable retry/cancellation and offline conflicts. They do not establish SwiftUI rendering, EventKit, Keychain, notification delivery or phone acceptance. Historical test names containing “native” describe the earlier protocol adapter; actual iOS checks live under `apps/ios`.

`ProtocolChat` supplies in-memory state to the pinned AI SDK's `AbstractChat`. Streaming, transport and cancellation use the real SDK without React subscriptions; model responses in local HTTP tests are controlled fixtures. Live provider results are recorded separately.

Root `test:*` scripts select each of the 202 root unit files exactly once; the tooling guard checks both duplicates and omissions. `tests/integration` imports these adapters for real PostgreSQL/PostgREST and HTTP journeys. This package has no exports or production consumers, and its source/tests are excluded from Vercel uploads. It has no React, React Native or Expo dependency.

`src/legacy-push` retains the old HTTP provider/worker solely for historical ticket, checkpoint and migration tests. Tests supply controlled transports. The server consumes provider-independent delivery ports and direct APNs; its retained historical receipt identity schema has no provider transport. A tooling check bundles the actual API and rejects fixture/client modules or the former provider endpoint.
