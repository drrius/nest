# Nest

A fresh, private iPhone app for reducing the mental effort of running a two-person household.

This is the authoritative rewrite repository. `/home/drrius/Work/household-os` is the legacy reference and migration source. No old application implementation is copied by default. Selective reuse requires auditing behavior and carrying meaningful tests with it.

Read [the confirmed brief](docs/native-rewrite/product-and-design.md) and [the implementation plan](docs/native-rewrite/implementation-plan.md). Quiet is the approved visual direction. Use image generation for new artwork.

## Tooling

- TypeScript 7.0.2, patched with Effect tsgo 0.45.0 for native LSP and compiler diagnostics.
- Oxlint 1.82.0 and tsgolint 7.0.2001, pinned together as required by the Effect integration.
- Oxfmt 0.68.0; native React, React Native and Expo lint checks.
- 400 total lines per handwritten source file; 80 code lines per function; cyclomatic complexity 10; nesting 4; parameters 4. Test setup callbacks are exempt only from function length. Generated source is excluded.

Run `pnpm install`, `pnpm lint`, `pnpm typecheck`, and `pnpm test:tooling`. Use the workspace TypeScript 7 language server in your editor; VS Code-family workspace settings are included. There is no TypeScript 6 compatibility dependency or legacy ESLint pipeline here.

## Status

Repository and tooling foundation only. Native screens, backend, migrations and device verification are not implemented yet. The HTML prototype uses fictional data and is not production functionality. GitHub: `drrius/nest`. EAS project, bundle identity and deployment remain to be established deliberately before distribution. See [progress](docs/progress.md) for milestone evidence and external blockers, and the [action inventory](docs/native-rewrite/action-inventory.md) for UI/AI policy.
