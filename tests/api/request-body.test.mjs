import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { commandBody } from "../../apps/api/src/request-body.ts";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));

test("streaming command bodies enforce byte limits without trusting Content-Length", async () => {
  let canceled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8193));
    },
    cancel() {
      canceled = true;
    },
  });
  const request = new Request("http://localhost", {
    method: "POST",
    body,
    duplex: "half",
    headers: { "content-type": "application/json", "content-length": "1" },
  });
  await assert.rejects(Effect.runPromise(commandBody(request)), { code: "invalid_request" });
  assert.equal(canceled, true);
});

test("canceling an in-flight body read closes its stream instead of leaving a reader running", async () => {
  let canceled = false;
  const body = new ReadableStream({
    cancel() {
      canceled = true;
    },
  });
  const request = new Request("http://localhost", {
    method: "POST",
    body,
    duplex: "half",
    headers: { "content-type": "application/json" },
  });
  const abort = new AbortController();
  const result = Effect.runPromise(commandBody(request), { signal: abort.signal });
  setTimeout(() => abort.abort(), 10);
  await assert.rejects(result);
  assert.equal(canceled, true);
});

test("malformed UTF-8 and JSON do not enter command decoding", async () => {
  for (const body of [new Uint8Array([0xff]), "{broken"]) {
    const request = new Request("http://localhost", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });
    await assert.rejects(Effect.runPromise(commandBody(request)), { code: "invalid_request" });
  }
});
