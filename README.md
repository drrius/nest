# Nest

A fresh, private iPhone app for reducing the mental effort of running a two-person household.

This is the authoritative rewrite repository. `/home/drrius/Work/household-os` is the legacy reference and migration source. No old application implementation is copied by default. Selective reuse requires auditing behavior and carrying meaningful tests with it.

Read [the confirmed brief](docs/native-rewrite/product-and-design.md) and [the implementation plan](docs/native-rewrite/implementation-plan.md). Quiet is the approved visual direction. Use image generation for new artwork.

The iPhone client is SwiftUI in [`apps/ios`](apps/ios), following [ADR 0002](docs/adr/0002-swiftui-client.md). The TypeScript backend and shared domain rules remain in `apps/api` and `packages`. The former React Native client and its framework dependencies have been removed; audited protocol tests live in an unexported test package.

## Tooling

- TypeScript 7.0.2, patched with Effect tsgo 0.45.0 for native LSP and compiler diagnostics.
- Oxlint 1.82.0 and tsgolint 7.0.2001, pinned together as required by the Effect integration.
- Oxfmt 0.68.0, Oxlint and strict Swift formatting/source checks.
- 400 total lines per handwritten source file; 80 code lines per function; cyclomatic complexity 10; nesting 4; parameters 4. Test setup callbacks are exempt only from function length. Generated source is excluded.

Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:tooling`. Run focused unit/integration checks for the changed slice; database fixtures need PostgreSQL and pinned PostgREST. Use the workspace TypeScript 7 language server in your editor. [Native build instructions](apps/ios/README.md) require a Mac with Xcode. [Protocol fixtures](packages/protocol-fixtures/README.md) retain meaningful authorization, approval, offline and transport checks without a UI framework.

## Status

SwiftUI screens, authorized backend commands, scoped offline recovery and corresponding assistant actions are implemented across the agreed scope, with bounded local, hosted and CI evidence. SwiftUI 0.1.0/build10 is available in internal TestFlight against the isolated test backend, with push disabled. Full acceptance remains incomplete: live AI eligibility, APNs provider/scheduling and both-phone usability/privacy/offline journeys are still open. Later expense UI fixes are not in build10. Production has not been migrated or cut over. See [progress](docs/progress.md) for exact milestone evidence/blockers and [the action inventory](docs/native-rewrite/action-inventory.md) for UI/AI policy. [Distribution metadata](tools/distribution/README.md) supports uploading locally signed native IPAs through the existing submission service.
