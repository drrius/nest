# Nest progress

## 19 September 2026 — M7 pure CHF rule extraction

Audited legacy CHF parsing, equal/exact allocations, balances and meaningful tests. Added a dependency-free pure domain package with exact parsing/formatting, equal/exact/percentage allocations and validated zero-sum balance derivation. BigInt avoids unsafe intermediate arithmetic. Percentage half-cent ties favor the payer; 50% matches equal split. Opening and reversal entries remain part of derived balances.

Six tests pass, including four reproducible 1,000-case property runs over safe integer amounts, percentages and balanced histories. TypeScript 7 and scoped lint pass. This is independent M7 groundwork, not financial posting, storage, approvals or a native Money vertical slice. See `packages/domain/README.md` for deliberate differences from the audited legacy helpers.

PR #4 adds the native chore receipt migration candidate and ten real PostgreSQL fixture tests; current-commit CI passes. PRs #1–#4 remain open awaiting explicit Greptile review. No production changes or merges. Native verification and full legacy recurrence compatibility remain separate gaps. The removed overnight automation stays removed.

## 19 September 2026 — fresh repository

The owner chose a separate greenfield repository after tooling compatibility work exposed legacy coupling. This supersedes the earlier same-repository recommendation.

Copied only approved planning/prototype materials. Added independent native tooling and the Quiet color seed. No application screens or backend implementation is claimed. TypeScript reports 7.0.2+effect-tsgo.0.45.0. Native typechecking and lint pass for the foundation. Six lint-contract checks pass: oversized files/functions, complexity, native raw text/Expo environment access, a valid native component, and Effect floating-effect diagnostics. Formatting passes. CI runs these checks on pushes and PRs.

Next: finish lint/compiler verification, record scope/action inventory, implement the native shell and a real end-to-end authenticated slice according to the plan. The legacy application remains at /home/drrius/Work/household-os.

## 20 September — domain review correction

Raised the root Node engine floor to 24 after Greptile identified that early Node 22 releases cannot run the direct TypeScript-importing tests. This matches CI. Financial domain behavior is unchanged; the six domain tests, including four 1,000-case properties, pass on the local runtime. CI and updated-commit review remain required.
