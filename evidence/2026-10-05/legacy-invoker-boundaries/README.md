# Retained invoker reads and versioned option edits

Two retained public invoker entries pass **53 full-chain SQL cases**:31 refusals
and22 successful/read-isolation flows. The disposable PostgreSQL18.6 run applies
54 legacy and253 Nest migrations. Only the exact `pg_net` declaration is excluded;
Auth/session and Storage facilities are simulated. Hosted test uses PostgreSQL17.6.

The original attention query failed on a retained near-minimum renewal date when
subtracting its cancellation lead time. The new pure private deadline helper
catches only PostgreSQL's [date-overflow condition](https://www.postgresql.org/docs/current/errcodes-appendix.html)
and returns no deadline for an unrepresentable result. Valid arithmetic, including
representable BC dates and infinite legacy values, is preserved. Query horizons
must be finite and representable. No legacy row is rewritten or deleted.
[Migration](../../../supabase/migrations/20261005100548_native_legacy_attention_dates.sql)
was created with Supabase CLI2.113.0 and applied once to **nest-test only**.
Its source filename is100548; the hosted ledger records100952 under the same name.
[Hosted history](hosted-migration-history.json). Exact bodies verify the deployment.

Both partners exercise current-version archive/restore, stale and missing revisions,
a later partner edit, foreign option identities and anonymous refusal. Retrying an
old version is a conflict; complete option rows remain unchanged after that refusal.
Attention reads enforce real fixture RLS for both partners, a foreign household,
nonmember and absent identity. Tests cover20/5-row pagination, later/empty pages,
overdue renewals, archived/ended/undated/future exclusions and invalid queries.
Every read preserves complete asset/commitment rows. All positive flows compare
foreign records and complete finance/attachment/Storage metadata before rollback.

Four [focused database tests](focused-database-tests.txt) verify2,928 arithmetic
combinations, actual date overflow, null/infinite semantics, invalid horizons and
invoker/client/service privileges. Routine CI now includes only these four focused
tests rather than adding the whole migration rehearsal to every PR.
[Cases](cases.csv), [schema summary](schema-summary.json),
[migration inputs](migration-inputs.csv), [diagnostic inputs](diagnostic-inputs.csv).
Original seven financial events/eight allocations/14 ledger rows/one financial
receipt and retained excluded/renewal records reconcile through all307 migrations.

All three hosted body hashes, client grants, invoker flags and search paths match
compiled metadata. Two complete metadata rows match; the retained archive wrapper's
trusted-service EXECUTE differs. [Comparison](function-comparison.json),
[compiled](compiled-functions.json), [hosted](hosted-functions.json).
Hosted [default function privileges](hosted-default-function-privileges.json)
independently explain that pre-existing platform difference;
[query](hosted-default-function-privileges-query.sql). Public grants and the archive
wrapper are unchanged by this migration. The new private helper reads no table and
grants execute only to authenticated/service roles; it adds no privileged definer.
No ACL was changed to conceal a fixture mismatch.

A temporary hosted transaction seeds one unrepresentable and two valid synthetic
renewals, then switches to authenticated database roles/claims. Each member sees
the two valid rows; the outsider sees none. [Probe SQL](hosted-rls-probe.sql),
[results](hosted-rls.json). Independent [checkpoint SQL](hosted-checkpoint-query.sql)
proves all20 retained table fingerprints, including61 financial events and Storage
metadata, remain exact [before](hosted-before.json)/[after rollback](hosted-after-rollback.json).
The initial household selector refused before INSERT; its checkpoint remained exact.
[Pre-fix/observer record](pre-fix-diagnostic.json). This proves populated hosted SQL
role/RLS behavior; it is not HTTP bearer, Apple sign-in, native or phone evidence.

[Fresh advisors](hosted-advisor-summary.json) contain the same three security/two
performance notice types. Security findings are identical apart from observation
timestamps; no new finding appears. One formerly unused-index finding is no longer
reported; it is [recorded](hosted-performance-no-longer-reported.csv), not suppressed.
Existing advisor/security and wider trusted-service acceptance remain open.

The [public entry inventory](public-entry-review-inventory.csv) now has bounded
evidence for60 definers and2 invokers. [Remaining scope](remaining-review-scope.json)
includes private/direct table/Storage/service/external-writer and cutover acceptance.
Legacy inventory/decisions/plans stay outside Nest's client/tools. Full M1–M9,
live AI, worker/APNs and both phones remain open. Scoped format/lint/limits and
four manifest tests pass. Routine CI37295749488 passes exact source `40d01132`,
including the four focused database tests. [CI metadata](ci-40d01132.json). Two pre-existing
schema-probe Effect Node-import warnings remain. No new binary/beta, provider call,
dispatcher, production change, purchase, merge or automation occurred.
