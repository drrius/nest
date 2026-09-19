# Nest progress

## Milestone checklist

“Complete” requires each milestone's exit criteria in the implementation plan. A partial implementation or successful bundle is not native verification.

| Milestone                           | Implementation                                      | Local / CI evidence                                                        | Device / external gate                                                           |
| ----------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| M0 Decisions and verification route | In progress: tooling, ADR 0001 and action inventory | Existing tooling evidence below; delivery documentation formatting checked | No executable native smoke yet; EAS login works, Nest project unlinked           |
| M1 Quiet native interactions        | Not implemented; approved HTML reference only       | None                                                                       | Native usability/accessibility review pending                                    |
| M2 Authenticated offline/AI slice   | Not implemented                                     | None                                                                       | Isolated backend, provider streaming and native journey pending                  |
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
- Existing `Build Nest native rewrite` heartbeat (`watch-testflight-fixes-pr`, every ten minutes) updated in place to continue this task and enforce current review/operational boundaries. No duplicate automation created.
- GitHub access verified; no open PRs at initial inspection. Working branch: `codex/native-delivery-contract`. No PR merged in this session yet.
- Read Expo overview, native UI, UI, Router, dev-client and EAS simulator guidance. Current pins are Expo 57.0.23, Router 57.0.21, React Native 0.86.3 and Effect 4.0.0-rc.115.
- `eas whoami` succeeds. CLI exposes `simulator:availability` and simulator automation commands. Availability check from Nest fails because this new repo has no linked EAS project; this is not proof the account lacks access. Linux has no `xcrun`, so local iOS execution is unavailable.
- Audited legacy app configuration and root session gate as reference only. Its development profile enables mock data and simulator-only builds; do not copy those defaults into Nest. Keep release/bundle identity deliberate to avoid replacing the existing app during development.

### Exact outstanding setup

1. Establish Nest's isolated development bundle/EAS project and verify existing free quota before starting any cloud build/session. No purchases authorized. Physical signing/install path and smoke runner still need implementation.
2. Provision only local/isolated fixture backend for development; real production migration remains forbidden. No server/provider credentials have been copied or printed.
3. Physical tests will need both members' iPhones with a matching development build, existing Apple identities and selected device calendars. APNs, Keychain, background behavior and usability cannot be inferred from Linux typechecks.

These gates do not block independent source implementation and fixture tests. Next: native shell and M2 authorized chore/operation-receipt architecture proof.

## 19 September 2026 — fresh repository

The owner chose a separate greenfield repository after tooling compatibility work exposed legacy coupling. This supersedes the earlier same-repository recommendation.

Copied only approved planning/prototype materials. Added independent native tooling and the Quiet color seed. No application screens or backend implementation is claimed. TypeScript reports 7.0.2+effect-tsgo.0.45.0. Native typechecking and lint pass for the foundation. Six lint-contract checks pass: oversized files/functions, complexity, native raw text/Expo environment access, a valid native component, and Effect floating-effect diagnostics. Formatting passes. CI runs these checks on pushes and PRs.

Next: finish lint/compiler verification, record scope/action inventory, implement the native shell and a real end-to-end authenticated slice according to the plan. The legacy application remains at /home/drrius/Work/household-os.
