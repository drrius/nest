# Nest progress

## 19 September 2026 — M2 transactional chore receipt candidate

Implemented a gated additive migration wrapping the existing chore-completion engine. New receipts bind household, verified actor, operation UUID and exact request. Retries return the stored outcome; changed payloads fail. A partner who completed first remains the recorded completer, with an honest already-completed acknowledgment. Stale/rescheduled/skipped occurrences conflict. Completion and receipt commit or roll back together. Receipt RLS is actor-only with current membership, and direct writes/anonymous execution are denied.

Established real local PostgreSQL 18.6 fixture testing without Docker: verified and extracted the matching signed server package to `/tmp`, then used disposable clusters on private Unix sockets with TCP disabled. Ten tests pass, including simultaneous partner completion, duplicate operation races, rollback and RLS. Fixture clusters are removed after tests. The closure fixture does not prove the full legacy recurrence engine; actual-schema compatibility/old-writer races and Supabase advisor checks remain before any production migration. No production changes or data access occurred.

This is partial M2 source/database work. It is not wired to native/API/AI yet. PR #1 documents delivery gates; #2 contains the dev-only native preview; #3 contains bearer identity. All remain unmerged awaiting explicit Greptile review. Native execution, offline SQLite and M3–M9 remain outstanding. The owner removed the overnight automation; do not recreate it from stale goal text.

## 19 September 2026 — fresh repository

The owner chose a separate greenfield repository after tooling compatibility work exposed legacy coupling. This supersedes the earlier same-repository recommendation.

Copied only approved planning/prototype materials. Added independent native tooling and the Quiet color seed. No application screens or backend implementation is claimed. TypeScript reports 7.0.2+effect-tsgo.0.45.0. Native typechecking and lint pass for the foundation. Six lint-contract checks pass: oversized files/functions, complexity, native raw text/Expo environment access, a valid native component, and Effect floating-effect diagnostics. Formatting passes. CI runs these checks on pushes and PRs.

Next: finish lint/compiler verification, record scope/action inventory, implement the native shell and a real end-to-end authenticated slice according to the plan. The legacy application remains at /home/drrius/Work/household-os.

## 20 September — chore receipt review corrections

Removed the receipt-to-current-membership foreign key: durable receipts must not prevent access revocation or be deleted to remove a member. Commands now lock current membership before receipt replay or completion; RLS still requires current membership. Added a database regression proving membership removal succeeds, receipts remain, and subsequent reads/replays are denied.

Completed occurrences now validate the expected due date before returning `already_completed`. A stale partner request conflicts without storing a receipt; an unchanged compatible request retains the original completer. These address both Greptile findings. Full audited legacy-schema compatibility remains a separate gate.
