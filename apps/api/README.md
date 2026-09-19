# Nest API

The initial M2 boundary exposes `createHandler({ url, publishableKey })` from `src/handler.ts`. It accepts a standard Request and returns a Response. `GET /v1/session` validates bearer identity with Supabase Auth, then reads exactly one current `household_members` record under that same user's token. No actor/household is accepted from client fields or editable user metadata. No admin key, cookie dependency or shared current-user global exists.

Effect v4 Schema validates both upstream responses; Context/Layer supplies identity, and the Effect HTTP client handles interruption and a ten-second per-request timeout. Invalid credentials are 401, absent/ambiguous membership 403, infrastructure/invalid data 503. Responses are non-cacheable and contain no upstream error details.

Configuration deliberately accepts new Supabase publishable keys only. The adapter queries the audited legacy membership shape (`user_id`, `household_id`, `display_name`) but has not been run against production or copied legacy data. No schema/migration is applied. The API is not yet deployed or connected to mobile.

Run `pnpm --filter @nest/api test` for ten focused HTTP-boundary cases. Tests start a loopback fixture server, requiring local socket access. They exercise the real HTTP adapter and Effect runtime; the upstream server is a fixture, so these are **not** RLS/database tests or proof of live Supabase configuration. Database RLS, chore commands, receipts, offline sync and AI remain next.

## Authorized chore commands

`GET /v1/chores` returns current open occurrences using the verified member's household and caller bearer token. `POST /v1/chores/complete` accepts `operationId`, `occurrenceId`, `expectedDueDate` and `completedOn`, invokes `nest_complete_chore` once and validates the returned receipt. The same Effect command factory is the intended native/AI boundary. Bodies are limited to 8 KiB; unknown fields and impossible dates are rejected. HTTP 409 means a version conflict; authorization failures and upstream unavailability remain distinct. Callers must preserve the operation ID after an uncertain response.

The read adapter deliberately refuses more than 200 returned occurrences instead of returning a knowingly incomplete snapshot. The caller cannot select an actor or household. PostgreSQL still checks current membership when executing the RPC, including revocation after API verification.

HTTP fixture tests exercise the actual Effect network adapter, credential forwarding, malformed responses and failures. Database receipt tests separately verify SQL authorization/atomicity. Real PostgREST embedding, complete legacy recurrence, native session/replay wiring and a live authenticated journey remain unverified. This API factory is not yet deployed.
