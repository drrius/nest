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

Two fresh read-only queries initially did not execute because automatic approval
review's model was at capacity. Approval review recovered; the strict inventory
found19 valid retained definitions. The migration is now applied only to nest-test
as20261005124055. All six function bodies match source, the original named CHECK
is validated, ten valid/invalid probes pass and all nine chore/finance/Storage
fingerprints are unchanged. All61 financial events remain. New helpers are
invokers with empty search paths and no anonymous execution; the validator retains
its existing authenticated-only execute grant. Security advisors report the same
three notice names as the prior checkpoint, with no validator notice. Existing
[privileged-function](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[leaked-password](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
and [RLS-without-policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
notices remain tracked; this is not blanket security acceptance. Production is
untouched. Routine CI passes
exact source `b035e9e2` at [run37309163039](https://github.com/drrius/nest/actions/runs/37309163039),
including all eight new database tests. No native execution,
new receipt upload, financial mutation, model call, release or merge is claimed.
