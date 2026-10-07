# Payroll production source identity

The separate drrius/household-payroll repository contains the four functions and
two trigger declarations missing from Household OS migrations. Source is pinned
at6d2b1ec20bd66e9f6e92426e2ae889f8d529cefa; its single payroll migration is
supabase/migrations/20260930060000_payroll.sql. The associated Vercel project is
Git-linked to that separate repository. No payroll code is copied into Nest.

A read-only production pg_proc query exports only signatures, language, volatility,
security-definer/search-path flags and body hashes. All four declarations match
those metadata fields. Three bodies match byte-for-byte: payroll_is_member,
payroll_payslip_supersede and payroll_restore. payroll_payslip_guard differs even
after whitespace normalization. The migration has one Git revision in returned
history, dated30September; current Git history does not explain that guard drift.
[Comparison](comparison.json). Production function bodies, Auth/household/payroll
rows and secrets are not exported; functions are not invoked or changed.

The source-location question is answered. Catalog parity remains false: preserve
these independent app objects and resolve guard drift before any production
cutover. Current runtime usage, provider environment, pending payroll work and
production migration authorization remain separate requirements. Nest does not
add payroll as a feature or replace this app's schema/functions.
