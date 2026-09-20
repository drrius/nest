# Nest API

The initial M2 boundary exposes `createHandler({ url, publishableKey })` from `src/handler.ts`. It accepts a standard Request and returns a Response. `GET /v1/session` validates bearer identity with Supabase Auth, then reads exactly one current `household_members` record under that same user's token. No actor/household is accepted from client fields or editable user metadata. No admin key, cookie dependency or shared current-user global exists.

Effect v4 Schema validates both upstream responses; Context/Layer supplies identity, and the Effect HTTP client handles interruption and a ten-second per-request timeout. Invalid credentials are 401, absent/ambiguous membership 403, infrastructure/invalid data 503. Responses are non-cacheable and contain no upstream error details.

Configuration deliberately accepts new Supabase publishable keys only. The adapter queries the audited legacy membership shape (`user_id`, `household_id`, `display_name`) but has not been run against production or copied legacy data. No schema/migration is applied. The native chore client is connected in source. No API is deployed.

Run `pnpm --filter @nest/api test` for 25 focused HTTP-boundary and Node adapter cases. Tests start a loopback fixture server, requiring local socket access. They exercise the real HTTP adapter and Effect runtime; the upstream server is a fixture, so these are **not** RLS/database tests or proof of live Supabase configuration. Separate database and PostgREST fixtures cover the invariants described below.

## Authorized chore commands

`GET /v1/chores` returns current open occurrences using the verified member's household and caller bearer token. `POST /v1/chores/complete` accepts `operationId`, `occurrenceId`, `expectedDueDate` and `completedOn`, invokes `nest_complete_chore` once and validates the returned receipt. The same Effect command factory is the intended native/AI boundary. Bodies are limited to 8 KiB; unknown fields and impossible dates are rejected. HTTP 409 means a version conflict; authorization failures and upstream unavailability remain distinct. Callers must preserve the operation ID after an uncertain response.

The read adapter deliberately refuses more than 200 returned occurrences instead of returning a knowingly incomplete snapshot. The caller cannot select an actor or household. PostgreSQL still checks current membership when executing the RPC, including revocation after API verification.

HTTP fixture tests exercise the actual Effect network adapter, credential forwarding, malformed responses and failures. Database receipt tests separately verify SQL authorization/atomicity. A separate disposable PostgREST integration test now verifies embedding and the receipt RPC. Complete legacy recurrence, real Supabase Auth and a live native member journey remain unverified. This API factory is not yet deployed.

`choreTools(request, config)` provides AI SDK list/complete tools over these same commands. Every execution verifies the request bearer and current membership again. The streaming route must supply the authenticated request; no live streaming route or provider is implied by this factory. SDK validation does not replace command validation.

## Isolated local development

Copy `.env.example` to `.env` in this directory and configure an isolated development backend whose audited legacy prerequisites and gated Nest migrations have been deliberately prepared. Run `pnpm --filter @nest/api dev` with Node 24+. The Node HTTP adapter binds **127.0.0.1 only** on port 8787; it propagates disconnect cancellation, request streaming and no-store responses. No service-role key, migration or deployment is part of startup.

For an iOS simulator on the same host, the mobile API origin can use localhost in a development build. A physical iPhone requires a deliberately configured HTTPS development endpoint; this script does not expose a public tunnel or deploy a server. Live Auth/provider identity setup remains a separate verification gate.

## Grocery checklist

`GET /v1/groceries` and `GET /v1/groceries/categories` bind verified household membership and request exact PostgREST counts. Reads reject truncation and mixed-household/malformed data; the current full-snapshot bounds are 500 groceries and 100 categories. Pagination for larger lists remains a release gap. Versions are selected using PostgREST's `::text` projection and validated as positive PostgreSQL bigint strings, without JavaScript number conversion.

`POST /v1/groceries/add`, `/edit`, `/remove` and `/check` share schemas with `groceryTools(request, config)`. All tools reverify membership per invocation. Add uses stable item/operation UUIDs; edit/remove/check require a string `expectedVersion`. Add/edit fields are `name`, nullable `quantity`, nullable `unit`, nullable `categoryId`. Check has `checked`; remove has no descriptive fields. Preserve exact operation IDs/payloads after uncertain responses. The server masks database details, returns 410 for unavailable targets and 409 for changed versions or legacy-claim reconciliation. Checking never creates money or finishes a shopping session.

The transport/SQL journey is verified locally; native grocery screens, queued replay and a live chat/provider remain required. Existing legacy claims remain metadata; removal is blocked until explicitly reconciled at production cutover.

## Private assistant streaming (read-only tools)

Configure server-only `AI_GATEWAY_API_KEY` and `NEST_AI_MODEL` to use a deliberately selected Gateway model. There is no default model or automatic purchase. `createHandler(config, { model })` accepts an injected SDK model for isolated verification; development startup creates the configured Gateway provider. No credential is bundled into mobile.

- `POST /v1/assistant/turn`: `{ conversationId, operationId, expectedRevision, text }`. UUIDs identify the conversation and user message; revisions are decimal strings. Text is limited to 2,000 characters within the shared 8 KiB JSON request cap. Unknown fields are rejected. The route authenticates membership, claims once, then reloads the owned canonical transcript under that claim. SDK SSE carries a server-bound assistant message ID. A repeated claim returns 409 with the existing turn; never regenerate it automatically.
- `GET /v1/assistant/conversation?id=UUID`: owner-private stored messages and exact revision, or null. `GET /v1/assistant/turn?conversationId=UUID&operationId=UUID`: persisted status and deadline, or 410 when unavailable. Both reverify membership.
- `POST /v1/assistant/interrupt`: `{ conversationId, operationId }`. After the deadline, explicitly marks an abandoned running turn interrupted. Before the deadline returns 409; terminal results remain unchanged. This is recovery, never a new model claim. Normal client cancellation aborts its stream and records partial output as interrupted.

The agent has only `listChores`, `listGroceries`, and `listGroceryCategories`; each execution reauthorizes through the same Effect commands used by native data views. Mutating tools are deliberately not registered until durable invocation recovery is integrated. Stored system/file/unsupported parts are rejected. Incomplete read-tool parts are omitted from model context without inventing outputs; durable history is unchanged. Model context uses at most the latest 20 messages within 128 KiB, with five steps, 2,048 output tokens, a 60-second timeout and no model retries. Provider details/reasoning are not sent to clients. Partial or bounded-out generations are interrupted, not reported complete.

Local integration command: `NEST_TEST_PG_BIN=/verified/postgres/bin NEST_TEST_POSTGREST_BIN=/verified/postgrest node --test packages/ai/tests/integration/assistant-postgrest.test.mjs` from the repository root. Four journeys use real SDK transport, API, PostgREST, PostgreSQL and RLS with synthetic Auth and model responses. They prove plumbing and authorization, not live model quality, hosted Auth, serverless post-disconnect lifetime or iPhone rendering. Production hosting must preserve bounded finalization after disconnection, or leave the saved claim for explicit deadline recovery. No native chat screen is connected yet.

`GET /v1/assistant/conversations` returns an owner-private page of up to 20 conversation IDs, exact revisions and timestamps, without prompts or messages. Follow `nextCursor` with `?cursor=<conversation ID>` to browse older chats. Ordering uses immutable creation time plus ID, retaining PostgreSQL microsecond precision; later activity and newer chats do not shift older pages. Missing or inaccessible cursor anchors return 410; reload the first page. All reads require current membership and work without model configuration. This endpoint does not create a conversation or invoke AI.
