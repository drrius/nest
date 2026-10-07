# Hosted test push session schema

A read-only catalog query on nest-test confirms the three Auth session columns
used by the native push authorization predicates: `id` and `user_id` are non-null
UUIDs; `not_after` is a nullable timestamp with time zone. The query role,
`postgres`, has SELECT privileges on those columns. The table is owned by
`supabase_auth_admin` with RLS enabled. The captured metadata agrees with the
existing minimal fixture's column assumptions.

[Observation](observation.json) and [query](catalog.sql) record read-only scope.
Only pg_catalog metadata is selected; no Auth session, user, device/token or
household rows are read. No schema/configuration, credentials, jobs, provider
requests or production state change. The three expected type/nullability pairs
are checked against literal expectations locally.

This closes the column-shape prerequisite in the [worker runbook](../../../docs/native-rewrite/push-worker-runbook.md).
It does not establish full Auth schema, API policies, refresh/expiry behavior,
server worker configuration, Apple tokens, APNs acceptance or phone delivery.
Existing bounded authorization tests retain their own scope. Push stays disabled,
build 23 is unchanged, and M8 remains open pending credentials and real delivery.
