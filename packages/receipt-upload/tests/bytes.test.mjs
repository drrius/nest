import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { readReceiptBytes, receiptByteLimit } from "../src/bytes.ts";
const run = Effect.runPromise;
const result = (body) =>
  run(
    readReceiptBytes(body).pipe(
      Effect.match({ onFailure: (e) => e.code, onSuccess: (bytes) => bytes }),
    ),
  );
test("stream reader bounds actual chunked bytes without relying on a Content-Length", async () => {
  let pulls = 0,
    cancelled = 0;
  const body = new ReadableStream({
    pull(c) {
      pulls++;
      c.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      cancelled++;
    },
  });
  assert.equal(await result(body), "too_large");
  assert.equal(cancelled, 1);
  assert.ok(pulls <= 6);
  assert.equal(body.locked, false);
});
test("bounded reader preserves exact bytes at the limit and rejects missing or empty content", async () => {
  const bytes = new Uint8Array(receiptByteLimit).fill(37);
  const body = new ReadableStream({
    start(c) {
      c.enqueue(bytes.subarray(0, 10));
      c.enqueue(bytes.subarray(10));
      c.close();
    },
  });
  assert.deepEqual(await result(body), bytes);
  assert.equal(body.locked, false);
  assert.equal(await result(null), "invalid");
  assert.equal(
    await result(
      new ReadableStream({
        start(c) {
          c.close();
        },
      }),
    ),
    "invalid",
  );
});
test("interruption cancels a blocked body and cannot return partial receipt bytes", async () => {
  let cancelled = 0;
  const controller = new AbortController(),
    body = new ReadableStream({
      cancel() {
        cancelled++;
      },
    });
  const pending = run(readReceiptBytes(body), { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, 1);
  assert.equal(body.locked, false);
});
test("stream read failure is finite and releases its lock", async () => {
  const body = new ReadableStream({
    pull(c) {
      c.error(new Error("private provider detail"));
    },
  });
  assert.equal(await result(body), "unavailable");
  assert.equal(body.locked, false);
});
