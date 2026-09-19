# Nest progress

## 19 September 2026 — fresh repository

The owner chose a separate greenfield repository after tooling compatibility work exposed legacy coupling. This supersedes the earlier same-repository recommendation.

Copied only approved planning/prototype materials. Added independent native tooling and the Quiet color seed. No application screens or backend implementation is claimed. TypeScript reports 7.0.2+effect-tsgo.0.45.0. Native typechecking and lint pass for the foundation. Six lint-contract checks pass: oversized files/functions, complexity, native raw text/Expo environment access, a valid native component, and Effect floating-effect diagnostics. Formatting passes. CI runs these checks on pushes and PRs.

Next: finish lint/compiler verification, record scope/action inventory, implement the native shell and a real end-to-end authenticated slice according to the plan. The legacy application remains at /home/drrius/Work/household-os.

## M4 — native grocery-check server command (feature branch)

Implemented `codex/grocery-check-receipts`: gated additive checked/version columns on existing grocery rows plus authenticated `nest_set_grocery_checked` and actor-scoped operation receipts. Compatible checks converge, opposite stale intents conflict, exact retries return one receipt, and legacy edits advance the version. Shopping-session/purchase fields remain untouched; no money is posted. The audited source is Household OS `4a528c96caf41515a70291ccecbba9d7b35e3349` grocery schema and column grants.

Locally verified: 12 focused PostgreSQL tests for retries, concurrent partner/duplicate operations, conflict/ABA detection, authorization/RLS/grants, failure rollback, legacy claim preservation, revoked membership and helper isolation. Supabase security advisors reported no issues against the disposable local fixture. Lint limits and formatting pass. No production migration ran; CI pending PR creation. Native/API/AI integration and full-schema rehearsal remain unverified.

### Milestone checklist

- [ ] M0/M1: delivery/native preview #1/#2 await review; device install and owner UX review remain.
- [ ] M2: auth #3, chore receipts #4, SQLite #6, SDK #8 and approvals #9 are independently tested foundations, not an integrated native slice.
- [ ] M3: real sign-in/onboarding/settings remain incomplete.
- [ ] M4: this grocery server command is implemented; native/AI wiring, conflict UI, online checklist editing and two-device offline journeys remain.
- [ ] M5/M6: Meals remains incomplete; Calendar boundary #7 still needs server consent/snapshots and device verification.
- [ ] M7: CHF domain #5 and approval boundary #9 are tested; real financial services/UI, recurring scheduler and reconciliation remain.
- [ ] M8/M9: push, full migration rehearsal and release/device acceptance remain incomplete.

PRs #1–#9 have passing current-commit CI but no Greptile responses. None is merged; no silence is counted as approval. Owner may need to enable/fix Greptile access for drrius/nest. iPhone development installation/simulator access remains needed for native evidence. Removed continuation automation stays absent. No purchases, production data changes or releases have occurred.

## 20 September — PostgreSQL client selection review

Fixed Greptile's harness finding: synchronous queries, SQL files and concurrent requests now use `psql` from `NEST_TEST_PG_BIN`, the same installation as `initdb` and `pg_ctl`. This avoids accidental PATH selection or missing-client failures. The disposable grocery receipt suite passes with the configured PostgreSQL installation. PRs #1 and #2 have merged after clean current-commit Greptile reviews, passing CI and resolved conversations; this branch still requires its own updated review.

Local setup evidence: the extracted server package lacked `psql`; the corrected harness failed explicitly with ENOENT. Verified both server and system client are PostgreSQL 18.6, linked `/usr/bin/psql` into the temporary test installation, then reran all 12 grocery tests successfully. The harness itself no longer falls back to PATH.
