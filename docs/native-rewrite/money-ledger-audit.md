# Money ledger boundary audit

Reference: Household OS commit `4a528c96caf41515a70291ccecbba9d7b35e3349`, migration `supabase/migrations/20260811200000_chf_ledger.sql`. No production data was read. This is a disposable fixture boundary, not a production migration or completed Money workflow.

## Deliberately retained source

`tests/database/legacy-money/tables.sql` contains the original expense category, financial event, allocation and ledger-entry tables and indexes. Composite household foreign keys, integer-centime bounds, event relationships, the single opening-balance index and single-reversal index are unchanged. `history-guards.sql` retains the original append-only functions/triggers for these three history tables and the statement-level zero-sum trigger. `read-access.sql` retains only their read policies and authenticated read grants/revocations. The provenance manifest records exact excerpt hashes; individual statements were compared with the pinned source.

`money-ledger-fixture.sql` uses the already audited tenancy fixture. Its shopping-session and expense-draft tables are explicitly FK-only interfaces: they preserve the referenced household/id shape, not shopping, receipt or draft behavior. The real legacy tables and associated storage policies must be audited before those workflows are tested. No member or service-role write path is introduced by this fixture.

## Observed invariants and limits

- Members read only their household's history; anonymous access and direct member writes are denied. History updates and deletion are rejected even for fixture administration. Opening-balance and reversal uniqueness are retained.
- PostgreSQL bigint entries and numeric aggregation preserve centimes exactly. Nest's existing pure domain calculation uses bigint internally and refuses a balance outside the safe integer range. The database type alone must not be decoded blindly into a JavaScript number.
- The legacy zero-sum trigger verifies sums for events touched by an insert. It does **not** prove exactly one entry for each of the two members, and an event can exist before any entries are inserted. A synthetic one-row zero event is accepted by that trigger but rejected by Nest's domain validator. New read boundaries must check event completeness and ownership, not infer correctness merely from a zero aggregate. This is not evidence of corrupt production history.
- Balance reads must include all retained events, including the original opening balance, reversals, replacements and refunds. Never derive the balance from a paginated history page, reset it during migration, or remove a corrected original.
- These checks prove schema constraints and arithmetic only. They do not prove atomic expense posting, receipt recovery, approval enforcement or concurrency for financial commands. The legacy `post_financial_event`, public command wrappers and later refund/opening-lineage fixes are still to be audited. Cookie-bound legacy server adapters are not copied.
- Legacy recurring draft generation is not an approved Nest automatic-posting mandate. Existing rules remain draft-only until explicit opt-in; no scheduler or production migration is enabled here.

## Local evidence

Four actual PostgreSQL cases verify append-only history, member/outsider/anonymous access, direct-write denial, opening/reversal uniqueness, failed unbalanced insertion rollback, and the incomplete-zero-pair case. Five hundred synthetic expense vectors include both signed safe-integer endpoints, matching payer/allocation data and comparison of PostgreSQL sums with Nest domain balances. All fixture data is generated locally. API/native balance/history/detail, approvals, receipts, settlements/corrections and automatic recurring commands remain outstanding.
