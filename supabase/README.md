# Native additive database candidates

**Do not apply these migrations to production without the owner's explicit approval.** No CI command applies migrations to any existing database. Fixture tests create a disposable PostgreSQL cluster with a private Unix socket and TCP disabled, apply synthetic schema plus the candidate, then stop/remove that cluster.

`20260919205503_native_chore_receipts.sql` adds actor/payload-bound completion receipts over the existing `public.complete_occurrence` engine. It does not replace recurrence semantics, copy production rows, or change old writers. It requires the existing membership, occurrence and completion tables plus `private.is_household_member`, `private.household_today` and `public.complete_occurrence`.

The public RPC is a security-invoker facade. The narrowly granted private definer validates caller membership itself before taking locks or reading receipts. Authenticated users can read only their own receipts while they remain members, and cannot directly insert/update/delete them. Anonymous callers cannot execute either entry point. The stable internal legacy retry key includes actor and operation UUID.

Before production approval, test against the actual audited legacy schema/engine and concurrent old writers, reconcile occurrence windows and financial references, run Supabase advisors, and complete the migration/cutover plan. The minimal fixture closure intentionally does not simulate recurrence or claim those checks passed.
