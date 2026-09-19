# Nest progress

## 19 September 2026 — fresh repository

The owner chose a separate greenfield repository after tooling compatibility work exposed legacy coupling. This supersedes the earlier same-repository recommendation.

Copied only approved planning/prototype materials. Added independent native tooling and the Quiet color seed. No application screens or backend implementation is claimed. TypeScript reports 7.0.2+effect-tsgo.0.45.0. Native typechecking and lint pass for the foundation. Six lint-contract checks pass: oversized files/functions, complexity, native raw text/Expo environment access, a valid native component, and Effect floating-effect diagnostics. Formatting passes. CI runs these checks on pushes and PRs.

Next: finish lint/compiler verification, record scope/action inventory, implement the native shell and a real end-to-end authenticated slice according to the plan. The legacy application remains at /home/drrius/Work/household-os.

## M6 — server consent and busy snapshots (feature branch)

Implemented `codex/busy-snapshot-consent`: gated owner-private consent settings and aggregate sanitized snapshots. Every selection revision atomically clears shared data; current-generation leases reject stale/in-flight publication after opt-out. Snapshot retries cannot alter content or renew a server-issued 15-minute freshness window. Interval payloads reject all extra fields. Partner RLS requires enabled consent, both memberships and unexpired data; removing/re-adding membership cannot restore previous sharing.

Locally verified: 12 PostgreSQL tests for authorization/privacy, opt-out races, stale generations, immutable retries, expiry, forbidden metadata, membership cleanup and replacement rollback. Supabase security advisors returned no issues on the disposable fixture. Lint limits and formatting pass. CI pending PR creation; no production migration, native integration or two-device network verification has run.

### Milestone checklist

- [ ] M0/M1: delivery/Quiet preview #1/#2 still need device installation and owner/native UX review.
- [ ] M2: auth #3, chore receipts #4, SQLite #6, SDK #8 and approvals #9 remain unintegrated foundations.
- [ ] M3/M4: real onboarding/settings and complete daily flows remain; grocery command #10 now has passing CI but needs native/API/AI wiring and online editing.
- [ ] M5: Meals remains incomplete.
- [ ] M6: device boundary #7 and this server boundary exist; consent UI, permission lifecycle, API integration and actual partner/AI privacy journeys remain.
- [ ] M7: CHF #5 and approvals #9 are tested; financial services/UI, recurring execution and reconciliation remain incomplete.
- [ ] M8/M9: real push, migration/release rehearsal and device acceptance remain incomplete.

PRs #1–#10 have passing current-commit CI; no Greptile response has arrived, and none is merged. Required external help if it persists: enable/fix Greptile access for drrius/nest. Native verification needs an iPhone development install or available simulator access. No purchases, production changes, releases or replacement automation have been performed.

## 20 September — busy-sharing review corrections

The additive consent migration now rejects an absent Household OS tenancy baseline before creating tables. Its fixture loads the three audited legacy tenancy migrations rather than inventing the membership schema; real FK/unique constraints, member cap, grants and RLS are exercised. Full-history/hosted Supabase rehearsal remains a pre-production gate; a fresh database is not the deployment target.

Reused the tested PostgreSQL harness correction from PR #12: configured client binary, bounded statements/locks/processes and idempotent exit/SIGINT/SIGTERM cleanup after startup. Added those real-process cleanup tests to this branch's focused CI command. SIGKILL/host failure cannot run cleanup. No native integration, device permission test or production application is claimed.

Verification: 13 busy-sharing PostgreSQL tests plus three harness process tests pass; local security advisors report no issues. Updated-commit CI and Greptile rereview are pending.
