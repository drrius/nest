# Diagnosing a Nest bug

For the two-person beta, report what happened and share a short diagnostic report.
Avoid reinstalling the app: that can lose offline drafts and unresolved requests.

## From the iPhone

In build25 or later, open Profile > Diagnostics > Share diagnostic report. Send it
with the screenshot, approximate time and what you tapped. The report includes up
to128requests from the current app session. Refresh it after reproducing the issue;
sharing is explicit. No account IDs, credentials, bodies, queries, calendar details,
private chat, receipt contents or financial amounts are included.

The report is held in memory and disappears when the app process exits. Its safe
fields also go to iOS OSLog, whose retention is managed by the OS. TestFlight crash
reports are available separately through Apple's tools; a request report is not a
crash dump. See [Apple's crash report guidance](https://developer.apple.com/documentation/xcode/acquiring-crash-reports-and-diagnostic-logs).

## Match the server request

Use requestId from the report, plus its startedAt and appBuild. The native client
sends X-Nest-Request-ID and a W3C traceparent to the API. A server request span and
its Auth/membership/RPC/AI spans carry the same request ID and trace ID.

With the existing authorized Vercel login:

```sh
vercel logs --project nest-test-api --scope drrius-projects \
  --query REQUEST_UUID --since 1h --limit 20 --json
```

Search promptly within the provider's available retention. No external drain or
paid collector is configured. Spans are emitted as structured JSON in runtime
logs, not stored in a separate trace dashboard. A missing historical log is not
proof the request succeeded or never ran.

The deployment ID identifies the server artifact. Deployment metadata
nestSourceCommit records the exact source for current CLI deployments; dated
release/deployment evidence also maps it to source. Git-connected deployments may
add VERCEL_GIT_COMMIT_SHA. CLI span build can be local when that variable is absent;
use the deployment ID, not that fallback, to identify deployed code.

Look at fixed route, status, outcome, duration_ms and stage. Supabase stages are
transport/decode/schema/response; known database error codes and RPC names are
included without database messages or data. Native categories distinguish timeout,
offline, HTTP error and decoding. For example, Money with one linked member returns
household_incomplete/409; a ledger integrity failure remains unavailable. Fix the
verified household setup instead of repeatedly retrying the connection.

AI generation/model/registered-tool spans include fixed operation, configured
model name, tool name, outcome and timing. SDK input/output recording is disabled
and per-call integrations replace global integrations. Prompts, memory, arguments,
outputs and raw provider exception details are never exported by this integration.
Live provider execution still needs its own acceptance check after eligibility.

## Preserve uncertain work

A timeout or error log cannot tell us whether a financial command committed. Read
its existing operation receipt or use native recovery; do not create another
expense/settlement to replace an uncertain request. Keep offline journals, immutable
operation IDs, append-only history and approval enforcement intact during debugging.

Build25 coverage includes the standard native HTTP client and API boundary,
identity, Supabase RPCs and AI SDK execution. Apple authentication transport,
native assistant SSE transport, Edge receipt processing, scheduling and APNs do
not all have independent spans yet. Diagnose those with their existing fixed error
states and platform logs; do not claim end-to-end telemetry for them.

The next source patch adds native SSE request/framing/receiver diagnostics. Ten
focused Mac cases pass; it is not in build25 or a live-provider verification.
[Evidence](../../evidence/2026-10-07/native-stream-diagnostics/README.md).

The next source also adds local Auth HTTP metadata, preserving the pinned SDK
transport and request unchanged. Four Mac adapter cases and two signed simulator
refresh-boundary cases pass. SDK response decoding is outside the fetch adapter;
references are local, not Auth-provider trace headers.
[Evidence](../../evidence/2026-10-07/native-auth-diagnostics/README.md).
