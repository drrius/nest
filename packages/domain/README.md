# Pure Nest domain

No React, database, network or platform dependencies. Application services will adapt these pure rules through Effect commands; none of these functions authorize or post money.

## Audited reuse

Reviewed legacy `src/domain/money/{chf,allocations,balances,values}.ts` and their focused/property tests in `/home/drrius/Work/household-os`. Reused the exact string-to-BigInt parser approach, payer-first equal split with odd-cent remainder to payer, exact-member validation and ledger-derived balance principle. No legacy screens or infrastructure were copied.

Deliberate changes:

- Parse the complete JavaScript safe-integer centime range (up to 14 franc digits with an exact upper-bound check); legacy field input used a narrower 13-digit bound.
- Reject invalid/negative formatter inputs instead of silently taking their absolute value. Signed balance presentation should be explicit at the UI boundary.
- Validate each ledger event contains exactly two opposite household-member entries. Reject partial, duplicate, foreign or unbalanced entries before deriving balances.
- Sum using BigInt so valid final balances do not depend on event ordering or overflow intermediate floating-point sums; reject unsafe final balances.
- Add percentage splits in integer basis points using largest remainders; exact half-cent ties go to the payer. This matches the equal-split rule at 50% and avoids multiplication overflow.

Six tests include four deterministic 1,000-case property runs (seed 20260919) plus invalid-input and opening/reversal examples. Run `pnpm test:domain`. TypeScript 7 and scoped lint pass. No append-only storage, approval workflow, ledger posting, recurring mandate, native financial UI or migration reconciliation is implemented by this package yet.
