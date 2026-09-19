# Nest progress

## 19 September 2026 — fresh repository

The owner chose a separate greenfield repository after tooling compatibility work exposed legacy coupling. This supersedes the earlier same-repository recommendation.

Copied only approved planning/prototype materials. Added independent native tooling and the Quiet color seed. No application screens or backend implementation is claimed. TypeScript reports 7.0.2+effect-tsgo.0.45.0. Native typechecking and lint pass for the foundation. Six lint-contract checks pass: oversized files/functions, complexity, native raw text/Expo environment access, a valid native component, and Effect floating-effect diagnostics. Formatting passes. CI runs these checks on pushes and PRs.

Next: finish lint/compiler verification, record scope/action inventory, implement the native shell and a real end-to-end authenticated slice according to the plan. The legacy application remains at /home/drrius/Work/household-os.

## M2 — durable action approval boundary (feature branch)

Implemented `codex/durable-approvals`: gated additive approval records with owner/current-membership RLS, exact invocation/command/version/payload binding, 15-minute non-renewing expiry, immutable approve/deny decisions and internal transaction-only consumption. Public clients cannot mutate the table or execute the consume helper. Membership identity is retained for audit after revocation; membership locks protect authorization during writes. Native financial/recurring command names follow the approved action inventory.

Locally verified: nine real PostgreSQL 18.6 tests on synthetic data cover identity/tenant isolation, denied direct access, expiry/denial, payload tampering, duplicate requests, concurrent decisions/consumption, post-revocation denial and atomic rollback after a fixture write failure. Supabase security advisors against that disposable Unix-socket database returned no issues. Lint limits and formatting pass. The fixture is not a ledger; no production migration or live financial write has run. CI pending PR creation; API/native/device verification absent.

### Milestone checklist

- [ ] M0/M1: delivery/native preview PRs #1/#2 remain open; device build/install and owner usability/accessibility review remain.
- [ ] M2: session #3, chore receipts #4, SQLite #6, AI SDK #8 and this approval boundary exist independently. Full native auth/offline flow, private chat persistence, actual financial command transaction and live provider streaming/approve-resume remain incomplete.
- [ ] M3–M5: onboarding/settings, daily vertical flows and Meals remain incomplete.
- [ ] M6: Calendar boundary #7 has passing current-commit CI; server snapshots, consent and two-device privacy checks remain.
- [ ] M7: CHF domain #5 is tested; financial services/UI, recurring mandates/scheduler and exact history reconciliation remain incomplete.
- [ ] M8/M9: push, migration/release rehearsal and device acceptance remain incomplete.

PRs #1–#8 have passing current-commit CI and no Greptile review responses; none is merged. Required external action if this persists: verify Greptile is enabled for drrius/nest (installation metadata lookup with the available GitHub token returned HTTP 403). Native evidence still requires an iPhone development installation or available simulator access; Linux lacks Xcode and EAS simulator availability was false. No purchases, production migrations or publication have occurred. Removed continuation automation remains absent.
