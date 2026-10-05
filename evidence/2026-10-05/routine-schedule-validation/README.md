# Retained routine schedule validation

The hosted read-only probe captured earlier on 5 October returned SQL NULL for
weekly, monthly and one-off rules missing their required field, and true for an
after-completion rule missing its unit. The retained table CHECK accepted these
results. The legacy editor's `if not` guard also did not reject NULL.

The new migration preserves the validator's signature and existing privileges,
requires exact keys and types, and returns a nonnullable Boolean. Small immutable
invoker helpers retain integer, weekday, date and category rules, with empty
search paths and no anonymous helper execution. It replaces the existing table
constraint under its original name with an explicit `IS TRUE` check and validates
all retained rows. Invalid existing rows stop a transactional migration; they
are never repaired or deleted automatically.

Eight focused disposable PostgreSQL tests pass, with zero failures/skips:

- Old NULL/true reproduction, valid-rule compatibility and unchanged validator ACL.
- Required/missing/null/extra keys, wrong containers and schedule categories.
- Integer bounds/types, exact dates and leap years, unique weekdays and units.
- All127 nonempty weekday subsets, their reverse order and duplicate refusals.
- Decimal/exponent JSON encodings and 32-bit overflow boundaries.
- Real table insertion/update rejection and unchanged retained rows.
- Invalid preexisting-row revalidation refusal with complete transaction rollback.
- Legacy member/outsider editor refusals without history changes; native creation
  authorization, outsider RLS and pure helper privileges.

The308-migration local rehearsal passes and preserves retained routines,
occurrences, completions, all seven fixture financial events, eight allocations,
14 ledger entries and the receipt reference. Auth/Storage infrastructure is
simulated, pg_net is explicitly excluded, and local Supabase advisors did not run.
Four manifest tests, formatting, Oxlint and Swift source limits pass. SQL helper
bodies are3–15 code lines with manually checked complexity at most10.

Hosted inventory/after-checks and deployment remain pending: two fresh read-only
queries did not execute because automatic approval review's model was at capacity.
The migration has not been applied to nest-test or production. CI for this new
source remains pending until its commit is pushed and checked. No native execution,
new receipt upload, financial mutation, model call, release or merge is claimed.
