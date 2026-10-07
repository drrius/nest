# Hosted test scheduled-writer inventory

The connector first verifies project `tkjixmujjoustdiedfmw` is `nest-test`, healthy,
on PostgreSQL 17.6.1.166. Two catalog SELECTs inspect only that authorized test
project. Production, household rows, Auth records and stored files are not read
or changed. No hosted application job or audited entry point is invoked.

At 12:21:26 UTC on 7 October, pg_cron 1.6.4 and its extension-owned cron.job table
are present. The postgres query role has schema/table access and unfiltered RLS
visibility. The actual job catalog contains zero rows. This is a complete
point-in-time catalog observation, not proof that all scheduling or external
invokers are disabled. Missing extension/filtered visibility are not inferred.
[Observation](observation.json), [readiness query](readiness.sql),
[single-snapshot query](observation.sql).

All eight audited legacy entry-point definitions are present. Their definition
SHA-256 hashes are computed inside PostgreSQL; no function bodies, job commands,
embedded credentials or request headers are exported. Each remains a postgres-owned
security definer. The connector reports transaction_read_only=false. These are
pure catalog SELECTs with no BEGIN/COMMIT/SET or mutation; the prepared helper's
fresh-session read-only transaction guarantee is not claimed verified remotely.

The existing disposable schema runner now compiles 54 legacy and 257 native
migrations to compare this newly captured hosted state. It finishes and preserves
the synthetic financial reconciliation. The one excluded legacy pg_net declaration
and simulated Auth/Storage infrastructure remain explicit. This run answers the
new function-identity question; prior completed native journeys are not repeated.
[Compiled definitions and all source migration hashes](local-compiled.json).

All eight canonical definition hashes and security-definer flags match exactly
between the compiled PostgreSQL 18 fixture and hosted PostgreSQL 17.
[Comparison](definition-comparison.json). The fixture owner is drrius and the
hosted owner is postgres; this difference is retained. Owner capabilities, nested
private-function semantics, API execution grants and complete cutover safety are
not established by matching bodies. Earlier privilege evidence remains separate.
`compare-definitions.py` recomputes the comparison from the retained source and
hosted observations, refuses missing/different definition sets and fails if a
body hash or definer flag differs. It retains owner differences without treating
them as equivalent capabilities.

Source `971b2069` passes [routine CI 37621917353](https://github.com/drrius/nest/actions/runs/37621917353).
The retained comparison script at `6ef3c4b7` passes
[CI 37623018040](https://github.com/drrius/nest/actions/runs/37623018040).
Shipping native/backend code remains unchanged; these checks do not substitute
for production, device or live-worker acceptance.

The current [Supabase Cron documentation](https://supabase.com/docs/guides/cron)
identifies cron.job as the registration catalog. The changelog and relevant
[PostgreSQL minor-release notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
were checked before querying; no hosted upgrade, reindex or schema change is performed.

No hosted job is activated, paused, stopped or run; no credentials are transferred, AI
request made or production data accessed. Actual Edge/Vercel/other invokers,
running requests, pending outboxes and client intents, production inventory and
owner-approved retain/replace/stop decisions remain open. This does not close M9.
