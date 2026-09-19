# Nest progress

## 19 September 2026 — fresh repository

The owner chose a separate greenfield repository after tooling compatibility work exposed legacy coupling. This supersedes the earlier same-repository recommendation.

Copied only approved planning/prototype materials. Added independent native tooling and the Quiet color seed. No application screens or backend implementation is claimed. TypeScript reports 7.0.2+effect-tsgo.0.45.0. Native typechecking and lint pass for the foundation. Six lint-contract checks pass: oversized files/functions, complexity, native raw text/Expo environment access, a valid native component, and Effect floating-effect diagnostics. Formatting passes. CI runs these checks on pushes and PRs.

Next: finish lint/compiler verification, record scope/action inventory, implement the native shell and a real end-to-end authenticated slice according to the plan. The legacy application remains at /home/drrius/Work/household-os.

## M6 — device availability privacy boundary (feature branch)

Implemented `codex/calendar-availability`: exact Expo Calendar 57.0.4 read adapter, Effect CalendarReader and a text-free busy-interval projection. Read permission is checked before/after capture. No selected calendars, restricted/missing calendars, failed fetches, malformed dates and revocation yield unknown. Free/canceled events are excluded; all-day absolute boundaries, detached occurrences and coverage/freshness are explicit. No native writes or network publisher exists.

Locally verified: 10 focused examples/service fixtures and 1,000 deterministic property cases for merged interval equivalence, clipping, ordering and duplication. TypeScript, formatting and lint limits pass. Expo config introspection confirms Calendar/full-read explanations and no Reminders usage-description keys. This is generated-config evidence, not a native permission test. CI pending PR creation; device verification absent.

### Milestone checklist and blockers

- [ ] M0/M1: delivery/shell PRs #1/#2 remain open. Native build/install, owner interaction/accessibility review and simulator access remain outstanding.
- [ ] M2: PRs #3/#4/#6 cover session authorization, chore receipts and the SQLite journal. #6 now has passing current-commit CI. Live native auth/replay and AI approval/streaming proof remain incomplete.
- [ ] M3–M5: onboarding, real daily flows and Meals remain incomplete.
- [ ] M6: this boundary is implemented locally; agenda UI, consent storage, atomic server snapshots/RLS, opt-out races and real two-device Calendar privacy verification remain.
- [ ] M7: CHF domain PR #5 is open; money services/UI and recurring approvals remain incomplete.
- [ ] M8/M9: real push, migration rehearsal and release journeys remain incomplete.

PRs #1–#6 have passing CI but no Greptile review response; none is merged. Exact merge blocker: Greptile must review each current commit explicitly and report no outstanding findings. Owner may need to enable/fix Greptile's drrius/nest repository access. Exact native blocker: Linux has no Xcode; EAS simulator availability returned false, and no physical iPhone development install is verified. Calendar 57 additionally requires a development build, not Expo Go. Independent work continues; no purchases, production migration or publication has occurred. Removed continuation automation remains absent.
