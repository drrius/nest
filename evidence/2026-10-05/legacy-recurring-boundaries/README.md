# Retained recurring-command boundaries

All six retained recurring public commands pass **144 full-chain SQL cases**:
132 refusals and12 successful member flows. The final disposable diagnostic
applies54 legacy and251 Nest migrations. Only the exact `pg_net` extension
declaration is excluded; Auth/session and Storage facilities remain simulated.
Local PostgreSQL is18.6, distinct from hosted test PostgreSQL17.6.

Covered commands are create, versioned update, active state, due-draft generation,
ordinary draft confirmation and dismissal. Tests exercise both members, foreign
members, a real outsider and absent identity; anonymous grants, missing retry keys,
foreign payer/allocation/category, invalid centimes/schedules, stale versions,
changed retry terms and the revoked unversioned update overload. Each probe runs
with actual PostgreSQL roles/claims in a rolled-back fixture.

Successful identical retries preserve one result. Creation/pause/edit do not
post financial entries or grant native recurring authority. Editing advances its
version while preserving every complete pending/dismissed/posted draft row.
Monthly catch-up across February/March/April creates only three missing pending
drafts, skips an inactive rule and advances to May31. Confirmation creates one
101-centime expense,51/50 allocations and50/−50 ledger deltas. Dismissal retains
the101-centime terms and creates no financial event.

The privileged adoption fixture deliberately contains an active old rule/pending
draft. All five old mutation paths refuse the mapped source. This proves guards
under malformed retained state; it does **not** prove native adoption approval,
reconciliation or concurrent-writer acceptance.

[Cases](cases.csv), [summary](schema-summary.json),
[migration inputs](migration-inputs.csv) and [diagnostic inputs](diagnostic-inputs.csv)
record the actual final run and source hashes. Complete original financial rows,
receipt metadata, recurring rules/drafts and excluded records remain exact;
the later cutover fixture also reconciles successfully.

A fresh single read-only hosted catalog query matches all11 tested signatures,
body hashes, search paths, definer flags and client grants, including the revoked
old update overload and four guard/version helpers. No hosted financial or
recurring command was executed. [Query](hosted-definition-query.sql),
[compiled metadata](compiled-functions.json), [hosted metadata](hosted-functions.json).
No migration, grant change or new hosted advisor result is claimed.

The [unique60-entry inventory](public-entry-review-inventory.csv) now has47 entries
with bounded evidence and [13 pending entries](remaining-public-entries.json).
All full acceptance gates remain open: broader private helpers, concurrent old
writers/adoption races, hosted Auth/Storage, external writers, native phone/UI
acceptance, live AI and worker/push. Scheduled posting remains disabled.

Scoped Oxfmt/Oxlint/source limits pass; two pre-existing schema-probe Effect
Node-import warnings remain. Routine CI37289460002 passes source `aa005b1e`. [CI metadata](ci-aa005b1e.json).
No native binary, beta, production mutation, purchase, source merge, automation,
provider inference or worker activation occurred.
