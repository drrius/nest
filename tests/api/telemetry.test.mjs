import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { observeHandler, backendTrace } from "../../apps/api/src/telemetry.ts";
import { requestJson } from "../../apps/api/src/supabase-request.ts";
import { createHandler } from "../../apps/api/src/handler.ts";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const traceId = "12345678901234567890123456789012";
const parentId = "1234567890123456";
const config = { url: "http://localhost/", publishableKey: "sb_publishable_private" };

test("request spans preserve W3C parents and UUIDs while logging only safe categories", async () => {
  const records = [];
  const handle = observeHandler(
    async () =>
      new Response("private response", {
        headers: { "Cache-Control": "no-store" },
      }),
    { VERCEL_GIT_COMMIT_SHA: "a".repeat(40), VERCEL_DEPLOYMENT_ID: "dpl_fixture" },
    (record) => records.push(record),
  );
  const response = await handle(
    new Request("https://fixture.example/v1/money/balance?token=private-query", {
      headers: {
        authorization: "Bearer private-token",
        "X-Nest-Request-ID": first,
        traceparent: `00-${traceId}-${parentId}-01`,
      },
    }),
  );
  assert.equal(response.headers.get("X-Nest-Request-ID"), first);
  assert.match(response.headers.get("traceparent"), new RegExp(`^00-${traceId}-[a-f0-9]{16}-01$`));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(records.length, 0);
  assert.equal(await response.text(), "private response");
  assert.equal(records.length, 1);
  assert.equal(records[0].parent_span_id, parentId);
  assert.equal(records[0].trace_id, traceId);
  assert.equal(records[0].route, "money.balance");
  assert.equal(records[0].status, 200);
  assert.equal(records[0].outcome, "complete");
  assert.equal(records[0].build, "a".repeat(40));
  assert.equal(records[0].deployment, "dpl_fixture");
  assert.ok(records[0].duration_ms >= 0);
  assert.doesNotMatch(JSON.stringify(records), /private|token|fixture\.example/);
});

test("invalid correlation headers, private paths and thrown errors never enter logs", async () => {
  const records = [];
  const handle = observeHandler(
    async () => {
      throw new Error("private-exception");
    },
    {
      VERCEL_GIT_COMMIT_SHA: "private-build",
      VERCEL_DEPLOYMENT_ID: "private-deployment",
    },
    (record) => records.push(record),
  );
  const response = await handle(
    new Request("https://fixture.example/private-path?private-query=secret", {
      headers: {
        "X-Nest-Request-ID": "private-request",
        traceparent: "00-00000000000000000000000000000000-0000000000000000-01",
        baggage: "private-baggage",
      },
    }),
  );
  assert.equal(response.status, 503);
  assert.match(response.headers.get("X-Nest-Request-ID"), /^[a-f0-9-]{36}$/);
  assert.match(response.headers.get("traceparent"), /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
  assert.equal(records[0].route, "unknown");
  assert.equal(records[0].outcome, "failed");
  assert.equal(records[0].build, "local");
  assert.doesNotMatch(JSON.stringify(records), /private|secret|00000000000000000000000000000000/);
});

test("parallel request and RPC spans keep their own parent and request IDs", async () => {
  const records = [];
  let releaseFirst;
  const waitForFirst = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const handle = observeHandler(
    async (request) => {
      if (request.headers.get("X-Nest-Request-ID") === first) await waitForFirst;
      const backend = backendTrace("rest/v1/rpc/nest_money_balance?private-id=secret");
      backend.stage("response");
      backend.status(400);
      backend.code("22023");
      backend.end(true);
      return new Response(null, { status: 409 });
    },
    {},
    (record) => records.push(record),
  );
  const pending = handle(
    new Request("https://fixture.example/v1/money/balance", {
      headers: { "X-Nest-Request-ID": first },
    }),
  );
  await handle(
    new Request("https://fixture.example/v1/money/balance", {
      headers: { "X-Nest-Request-ID": second },
    }),
  );
  releaseFirst();
  await pending;
  assert.equal(records.length, 4);
  for (const id of [first, second]) {
    const related = records.filter((row) => row.request_id === id);
    const request = related.find((row) => row.event === "nest.request");
    const backend = related.find((row) => row.event === "nest.supabase");
    assert.equal(backend.parent_span_id, request.span_id);
    assert.equal(backend.trace_id, request.trace_id);
    assert.equal(backend.rpc, "nest_money_balance");
    assert.equal(backend.code, "22023");
    assert.equal(backend.stage, "response");
  }
  assert.doesNotMatch(JSON.stringify(records), /private|secret/);
});

test("stream telemetry preserves bytes, backpressure and underlying cancellation", async () => {
  const records = [];
  let pulls = 0;
  let cancelled;
  const handle = observeHandler(
    async () =>
      new Response(
        new ReadableStream(
          {
            pull(controller) {
              pulls++;
              controller.enqueue(new TextEncoder().encode("data: private\n\n"));
            },
            cancel(reason) {
              cancelled = reason;
            },
          },
          { highWaterMark: 0 },
        ),
      ),
    {},
    (record) => records.push(record),
  );
  const response = await handle(new Request("https://fixture.example/v1/assistant/turn"));
  assert.equal(pulls, 0);
  const reader = response.body.getReader();
  const item = await reader.read();
  assert.equal(new TextDecoder().decode(item.value), "data: private\n\n");
  assert.equal(pulls, 1);
  await reader.cancel("private-cancel");
  assert.equal(cancelled, "private-cancel");
  assert.equal(records.length, 1);
  assert.equal(records[0].outcome, "cancelled");
  assert.doesNotMatch(JSON.stringify(records), /private/);
});

test("disconnect and subsequent stream cancellation end a span once", async () => {
  const records = [];
  const abort = new AbortController();
  const handle = observeHandler(
    async () => new Response(new ReadableStream()),
    {},
    (record) => records.push(record),
  );
  const response = await handle(
    new Request("https://fixture.example/v1/assistant/turn", { signal: abort.signal }),
  );
  abort.abort("private-reason");
  await response.body.cancel();
  assert.equal(records.length, 1);
  assert.equal(records[0].outcome, "cancelled");
});

test("Effect RPC failures include fixed response stages/codes without database error contents", async () => {
  const records = [];
  let sentHeaders;
  const handle = observeHandler(
    async () => {
      const result = requestJson(config, "private-token", "rest/v1/rpc/nest_money_balance", {
        household_id: "private-household",
        centimes: 1234567,
      }).pipe(
        Effect.provideService(FetchHttpClient.Fetch, async (_url, init) => {
          sentHeaders = new Headers(init.headers);
          return Response.json(
            {
              code: "42501",
              message: "private-error",
              details: "private-details",
              hint: "private-hint",
            },
            { status: 403 },
          );
        }),
        Effect.catchTag("ApiFailure", () => Effect.succeed(null)),
      );
      await Effect.runPromise(result);
      return new Response(null, { status: 503 });
    },
    {},
    (record) => records.push(record),
  );
  await handle(
    new Request("https://fixture.example/v1/money/balance", {
      headers: { "X-Nest-Request-ID": first },
    }),
  );
  const backend = records.find((row) => row.event === "nest.supabase");
  assert.equal(backend.stage, "response");
  assert.equal(backend.code, "42501");
  assert.equal(backend.status, 403);
  assert.equal(backend.outcome, "failed");
  assert.equal(sentHeaders.get("X-Nest-Request-ID"), first);
  assert.equal(sentHeaders.get("traceparent").split("-")[2], backend.span_id);
  assert.doesNotMatch(JSON.stringify(records), /private|1234567/);
});

test("identity schema failures identify their stage without logging identity contents", async (t) => {
  const { createServer } = await import("node:http");
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ id: "private-invalid-identity", email: "private-email" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const records = [];
  const handle = observeHandler(
    createHandler({
      url: `http://127.0.0.1:${server.address().port}`,
      publishableKey: "sb_publishable_private",
    }),
    {},
    (record) => records.push(record),
  );
  const response = await handle(
    new Request("https://fixture.example/v1/session", {
      headers: { authorization: "Bearer private-token" },
    }),
  );
  assert.equal(response.status, 503);
  await response.text();
  const backend = records.find((row) => row.event === "nest.supabase");
  assert.equal(backend.rpc, "auth.user");
  assert.equal(backend.stage, "schema");
  assert.equal(backend.outcome, "failed");
  assert.equal(backend.status, 200);
  assert.doesNotMatch(JSON.stringify(records), /private|email|token/);
});

test("a failed telemetry sink cannot change the response", async () => {
  const handle = observeHandler(
    async () => Response.json({ okay: true }),
    {},
    () => {
      throw new Error("unavailable log sink");
    },
  );
  const response = await handle(new Request("https://fixture.example/v1/session"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { okay: true });
});

test("RPC transport and JSON decode failures remain distinguishable without exception text", async () => {
  for (const stage of ["transport", "decode"]) {
    const records = [];
    const handle = observeHandler(
      async () => {
        await Effect.runPromise(
          requestJson(config, "private-token", "rest/v1/rpc/nest_money_balance").pipe(
            Effect.provideService(FetchHttpClient.Fetch, async () => {
              if (stage === "transport") throw new Error("private-transport-error");
              return new Response("private-invalid-json", { status: 200 });
            }),
            Effect.catchTag("ApiFailure", () => Effect.succeed(null)),
          ),
        );
        return new Response(null, { status: 503 });
      },
      {},
      (record) => records.push(record),
    );
    await handle(new Request("https://fixture.example/v1/money/balance"));
    const backend = records.find((row) => row.event === "nest.supabase");
    assert.equal(backend.stage, stage);
    assert.equal(backend.outcome, "failed");
    assert.doesNotMatch(JSON.stringify(records), /private|token/);
  }
});

test("stream failures preserve their error for the consumer and log only the failure category", async () => {
  const records = [];
  const handle = observeHandler(
    async () =>
      new Response(
        new ReadableStream(
          {
            pull(controller) {
              controller.error(new Error("private-stream-error"));
            },
          },
          { highWaterMark: 0 },
        ),
      ),
    {},
    (record) => records.push(record),
  );
  const response = await handle(new Request("https://fixture.example/v1/assistant/turn"));
  await assert.rejects(response.text(), /private-stream-error/);
  assert.equal(records.length, 1);
  assert.equal(records[0].outcome, "failed");
  assert.doesNotMatch(JSON.stringify(records), /private/);
});
