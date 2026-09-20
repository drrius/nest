# Nest API

The initial M2 boundary exposes `createHandler({ url, publishableKey })` from `src/handler.ts`. It accepts a standard Request and returns a Response. `GET /v1/session` validates bearer identity with Supabase Auth, then reads exactly one current `household_members` record under that same user's token. No actor/household is accepted from client fields or editable user metadata. No admin key, cookie dependency or shared current-user global exists.

Effect v4 Schema validates both upstream responses; Context/Layer supplies identity, and the Effect HTTP client handles interruption and a ten-second per-request timeout. Invalid credentials are 401, absent/ambiguous membership 403, infrastructure/invalid data 503. Responses are non-cacheable and contain no upstream error details.

Configuration deliberately accepts new Supabase publishable keys only. The adapter queries the audited legacy membership shape (`user_id`, `household_id`, `display_name`) but has not been run against production or copied legacy data. No schema/migration is applied. The native chore client is connected in source. No API is deployed.

Run `pnpm --filter @nest/api test` for 24 focused HTTP-boundary and Node adapter cases. Tests start a loopback fixture server, requiring local socket access. They exercise the real HTTP adapter and Effect runtime; the upstream server is a fixture, so these are **not** RLS/database tests or proof of live Supabase configuration. Separate database and PostgREST fixtures cover the invariants described below.

## Authorized chore commands

`GET /v1/chores` returns current open occurrences using the verified member's household and caller bearer token. `POST /v1/chores/complete` accepts `operationId`, `occurrenceId`, `expectedDueDate` and `completedOn`, invokes `nest_complete_chore` once and validates the returned receipt. The same Effect command factory is the intended native/AI boundary. Bodies are limited to 8 KiB; unknown fields and impossible dates are rejected. HTTP 409 means a version conflict; authorization failures and upstream unavailability remain distinct. Callers must preserve the operation ID after an uncertain response.

The read adapter deliberately refuses more than 200 returned occurrences instead of returning a knowingly incomplete snapshot. The caller cannot select an actor or household. PostgreSQL still checks current membership when executing the RPC, including revocation after API verification.

HTTP fixture tests exercise the actual Effect network adapter, credential forwarding, malformed responses and failures. Database receipt tests separately verify SQL authorization/atomicity. A separate disposable PostgREST integration test now verifies embedding and the receipt RPC. Complete legacy recurrence, real Supabase Auth and a live native member journey remain unverified. This API factory is not yet deployed.

`choreTools(request, config)` provides AI SDK list/complete tools over these same commands. Every execution verifies the request bearer and current membership again. The streaming route must supply the authenticated request; no live streaming route or provider is implied by this factory. SDK validation does not replace command validation.

## Isolated local development

Copy `.env.example` to `.env` in this directory and configure an isolated development backend whose audited legacy prerequisites and gated Nest migrations have been deliberately prepared. Run `pnpm --filter @nest/api dev` with Node 24+. The Node HTTP adapter binds **127.0.0.1 only** on port 8787; it propagates disconnect cancellation, request streaming and no-store responses. No service-role key, migration or deployment is part of startup.

For an iOS simulator on the same host, the mobile API origin can use localhost in a development build. A physical iPhone requires a deliberately configured HTTPS development endpoint; this script does not expose a public tunnel or deploy a server. Live Auth/provider identity setup remains a separate verification gate.
