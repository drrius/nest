import test from "node:test";
import assert from "node:assert/strict";
import { createServer, connect, constants } from "node:http2";
import { generateKeyPairSync } from "node:crypto";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import * as Redacted from "../../apps/api/node_modules/effect/dist/Redacted.js";
import { apnsPushTransport } from "../../apps/api/src/push/apns-transport.ts";
import { ApnsHttp2Client } from "../../apps/api/src/push/apns-request.ts";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const credentials = {
  keyId: "TESTKEY001",
  teamId: "TESTTEAM01",
  privateKey: Redacted.make(privateKey.export({ type: "pkcs8", format: "pem" })),
};
const household = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000003";
const delivery = {
  token: "aa".repeat(48),
  environment: "sandbox",
  apnsId: id,
  notification: { version: 1, kind: "renewal", householdId: household, renewalId: target },
};

async function fixture(t, respond, timeout = 10000) {
  const server = createServer();
  const calls = [];
  const origins = [];
  let connections = 0;
  server.on("session", () => {
    connections++;
  });
  server.on("stream", (stream, headers) => {
    stream.on("error", () => {});
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => {
      calls.push({ headers, body: JSON.parse(Buffer.concat(chunks)) });
      respond(stream, headers);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = new ApnsHttp2Client((origin) => {
    origins.push(origin);
    return connect(`http://127.0.0.1:${server.address().port}`);
  }, timeout);
  const transport = apnsPushTransport(credentials, "sandbox", client, () => 1800000000000);
  const production = apnsPushTransport(credentials, "production", client, () => 1800000000000);
  t.after(async () => {
    transport.close();
    await new Promise((resolve) => server.close(resolve));
  });
  return { calls, origins, transport, production, client, connections: () => connections };
}

test("real HTTP/2 sends only generic six-kind payloads and reuses credentials/environment connections", async (t) => {
  const f = await fixture(t, (stream, headers) => {
    stream.respond({ ":status": 200, "apns-id": headers["apns-id"] });
    stream.end();
  });
  const kinds = [
    ["renewal", "renewalId"],
    ["chore", "occurrenceId"],
    ["meal", "entryId"],
    ["grocery", "itemId"],
    ["recurring", "ruleId"],
    ["daily_summary", "summaryId"],
  ];
  for (const [kind, field] of kinds) {
    const notification = {
      version: 1,
      kind,
      householdId: household,
      [field]: target,
      ...(kind === "daily_summary" ? { recipientId: id } : {}),
    };
    assert.deepEqual(await Effect.runPromise(f.transport.send({ ...delivery, notification })), {
      status: "provider_accepted",
      apnsId: id,
    });
    const call = f.calls.at(-1);
    assert.deepEqual(call.body.nest, notification);
    assert.equal(call.body.aps.alert.title, "Nest");
    assert.equal(
      call.body.aps.alert.body,
      kind === "daily_summary" ? "Your daily summary is ready." : "You have a reminder in Nest.",
    );
  }
  assert.equal(f.calls[0].headers[":method"], "POST");
  assert.equal(f.calls[0].headers[":path"], `/3/device/${delivery.token}`);
  assert.equal(f.calls[0].headers["apns-topic"], "ch.drrius.nest");
  assert.equal(f.calls[0].headers["apns-expiration"], "0");
  assert.equal(f.calls[0].headers["apns-priority"], "10");
  assert.equal(f.calls[0].headers["apns-push-type"], "alert");
  assert.equal(
    f.calls.every((call) => call.headers.authorization === f.calls[0].headers.authorization),
    true,
  );
  assert.equal(f.connections(), 1);
  assert.deepEqual(f.origins, ["https://api.sandbox.push.apple.com"]);
  assert.deepEqual(
    await Effect.runPromise(
      f.production.send({ ...delivery, environment: "production", token: "aa" }),
    ),
    { status: "provider_accepted", apnsId: id },
  );
  assert.equal(f.connections(), 2);
  assert.equal(f.origins[1], "https://api.push.apple.com");
});

test("malformed tokens, routing, environments and private payload additions never dispatch", async (t) => {
  const f = await fixture(t, () => assert.fail("Invalid payload sent"));
  for (const invalid of [
    { ...delivery, token: "ExponentPushToken[fixture]" },
    { ...delivery, token: "a" },
    { ...delivery, token: "AA" },
    { ...delivery, token: "aa\n" },
    { ...delivery, token: "aa".repeat(2049) },
    { ...delivery, environment: "https://evil.example" },
    { ...delivery, environment: "production" },
    { ...delivery, apnsId: "bad" },
    { ...delivery, notification: { ...delivery.notification, renewalId: "bad" } },
    { ...delivery, notification: { ...delivery.notification, title: "Private title" } },
    { ...delivery, title: "Private override", notes: "Never send" },
  ])
    assert.deepEqual(await Effect.runPromise(f.transport.send(invalid)), { status: "unknown" });
  assert.equal(f.calls.length, 0);
  assert.equal(f.connections(), 0);
});

test("rate-limit, disconnect, oversized and mismatched responses never cause a second send", async (t) => {
  for (const respond of [
    (stream, headers) => {
      stream.respond({ ":status": 429, "apns-id": headers["apns-id"] });
      stream.end('{"reason":"TooManyRequests"}');
    },
    (stream) => stream.close(constants.NGHTTP2_INTERNAL_ERROR),
    (stream, headers) => {
      stream.respond({ ":status": 503, "apns-id": headers["apns-id"] });
      stream.end("x".repeat(8193));
    },
    (stream) => {
      stream.respond({ ":status": 200, "apns-id": "substituted" });
      stream.end();
    },
  ]) {
    const f = await fixture(t, respond);
    const result = await Effect.runPromise(f.transport.send(delivery));
    assert.equal(["unknown", "rejected"].includes(result.status), true);
    assert.equal(f.calls.length, 1);
    assert.equal(f.connections(), 1);
  }
});

test("bounded timeout and cancellation stop a stream without claiming delivery or resending", async (t) => {
  const f = await fixture(t, () => {}, 100);
  assert.deepEqual(await Effect.runPromise(f.transport.send(delivery)), { status: "unknown" });
  assert.equal(f.calls.length, 1);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    f.client.send(
      "sandbox",
      { headers: { ":method": "POST", ":path": "/unused" }, body: "{}" },
      abort.signal,
    ),
  );
  assert.equal(f.calls.length, 1);
});

test("cancelling an in-flight HTTP/2 request never replaces its stream or claims acceptance", async (t) => {
  const arrived = Promise.withResolvers();
  const f = await fixture(t, () => arrived.resolve());
  const abort = new AbortController();
  const request = f.client.send(
    "sandbox",
    {
      headers: { ":method": "POST", ":path": "/3/device/aa", "apns-id": id },
      body: "{}",
    },
    abort.signal,
  );
  const rejected = assert.rejects(request, /not confirmed/);
  await arrived.promise;
  abort.abort();
  await rejected;
  assert.equal(f.calls.length, 1);
  assert.equal(f.connections(), 1);
});
