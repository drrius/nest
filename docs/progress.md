# Nest progress

## Milestone checklist

“Complete” requires each milestone's exit criteria in the implementation plan. A partial implementation or successful bundle is not native verification.

| Milestone                           | Implementation                                      | Local / CI evidence                                                        | Device / external gate                                                           |
| ----------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| M0 Decisions and verification route | Partial: tooling, ADR/action inventory, isolated EAS dev project | Existing tooling evidence below; delivery documentation formatting checked | Prepared smoke, not run; EAS Simulator unavailable; no local iOS runner           |
| M1 Quiet native interactions        | Partial: development-only Quiet native preview (PR #2)       | None                                                                       | Native usability/accessibility review pending                                    |
| M2 Authenticated offline/AI slice   | In progress: bearer identity boundary (PR #3)                                     | None                                                                       | Isolated backend, provider streaming and native journey pending                  |
| M3 Identity/onboarding/settings     | Not implemented                                     | None                                                                       | Existing-member Apple identity and device refresh pending                        |
| M4 Today/chores/groceries           | Not implemented                                     | None                                                                       | Two-device retry/conflict journey pending                                        |
| M5 Meals/AI proposal/ingredients    | Not implemented                                     | None                                                                       | Real proposal/approval/provider journey pending                                  |
| M6 Calendar/privacy                 | Not implemented                                     | None                                                                       | Two iPhones with real calendars, permission/revocation checks pending            |
| M7 Money/recurring                  | Not implemented                                     | None                                                                       | Fixture ledger reconciliation and controlled scheduler pending                   |
| M8 Renewals/reminders/push          | Not implemented                                     | None                                                                       | APNs enrollment and physical delivery pending                                    |
| M9 Migration/release rehearsal      | Not implemented                                     | None                                                                       | Both-member usability, release binary, separate cutover/release approval pending |

## 19 September 2026 — autonomous delivery setup

- Read the approved product/design, architecture audit and implementation plan. Added [ADR 0001](adr/0001-native-delivery-contract.md) and [first-release action inventory](native-rewrite/action-inventory.md). The inventory is explicitly planned, not a list of working commands.
- Updated the superseded merge rule to the owner's latest authorization: small feature PRs; latest-commit CI plus explicit clean Greptile review and resolved conversations before squash merging. Production, spending and release gates remain separate. The current CI only verifies source; it has no deploy/migration step.
- The existing heartbeat was initially updated in place. The owner subsequently requested its removal; deletion reports it absent and no matching local automation config remains. Continue this task without recreating that automation.
- GitHub access verified; no open PRs at initial inspection. Working branch: `codex/native-delivery-contract`. No PR merged in this session yet.
- Read Expo overview, native UI, UI, Router, dev-client and EAS simulator guidance. Current pins are Expo 57.0.23, Router 57.0.21, React Native 0.86.3 and Effect 4.0.0-rc.115.
- `eas whoami` succeeds. CLI exposes `simulator:availability` and simulator automation commands. Nest is now linked to EAS project `b733c351-a149-4b49-b9df-e8c2a14514e2` on the Free account. The follow-up availability check explicitly returns `available: false`. Linux has no `xcrun`, so local iOS execution is unavailable.
- Audited legacy app configuration and root session gate as reference only. Its development profile enables mock data and simulator-only builds; do not copy those defaults into Nest. Keep release/bundle identity deliberate to avoid replacing the existing app during development.

### Exact outstanding setup

1. Nest development bundle `ch.drrius.nest.dev` and EAS project are configured in PR #2. Free iOS quota was 0/15 used; no build started. Physical signing/install and an executable native runner are still needed; Maestro smoke is prepared but not run.
2. Provision only local/isolated fixture backend for development; real production migration remains forbidden. No server/provider credentials have been copied or printed.
3. Physical tests will need both members' iPhones with a matching development build, existing Apple identities and selected device calendars. APNs, Keychain, background behavior and usability cannot be inferred from Linux typechecks.

These gates do not block independent source implementation and fixture tests. Next: native shell and M2 authorized chore/operation-receipt architecture proof.

## 19 September 2026 — fresh repository

The owner chose a separate greenfield repository after tooling compatibility work exposed legacy coupling. This supersedes the earlier same-repository recommendation.

Copied only approved planning/prototype materials. Added independent native tooling and the Quiet color seed. No application screens or backend implementation is claimed. TypeScript reports 7.0.2+effect-tsgo.0.45.0. Native typechecking and lint pass for the foundation. Six lint-contract checks pass: oversized files/functions, complexity, native raw text/Expo environment access, a valid native component, and Effect floating-effect diagnostics. Formatting passes. CI runs these checks on pushes and PRs.

Next: finish lint/compiler verification, record scope/action inventory, implement the native shell and a real end-to-end authenticated slice according to the plan. The legacy application remains at /home/drrius/Work/household-os.

## Feature branch evidence

- [PR #2](https://github.com/drrius/nest/pull/2), `a96d964`: native preview shell, generated artwork, development-only route guards, four stacks, shared grocery state, chore completion and single-dinner replacement in fictional data. Formatting, lint, TypeScript 7, tooling-contract tests and iOS Metro export pass; current-commit CI passes. Not device-verified, not connected to backend/auth/AI, not a completed M1.
- [PR #3](https://github.com/drrius/nest/pull/3), `6682c72`: Effect v4 bearer identity and user-scoped current membership handler. Ten HTTP fixture tests pass, including concurrent handler reuse, revocation, invalid identity, outsider rejection, redirect refusal and safe errors. API source lint/typecheck pass. Not deployed, not wired to native, and not database/RLS verification.
- Greptile review requested once per current feature commit; no responses observed yet. Do not merge on silence. No PR merged.
- Local Docker access is denied even with elevated execution. Investigate standalone fixture PostgreSQL for transactional/RLS tests. Sandbox HTTP fixture run stalled; explicitly permitted loopback run passes. No production data accessed.
