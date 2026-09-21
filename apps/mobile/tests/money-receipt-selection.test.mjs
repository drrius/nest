import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import {
  checkedReceiptBytes,
  receiptDimensions,
  receiptSelection,
} from "../src/money/receipt-selection.ts";
const pdf = () => new TextEncoder().encode("%PDF-1.7\nfixture");
const digest = async (bytes) => createHash("sha256").update(bytes).digest("hex");
const id = () => "00000000-0000-4000-8000-000000000001";
test("receipt photo dimensions remain positive, bounded and never upscale", () => {
  for (let n = 1; n <= 2000; n++) {
    const width = 1 + ((n * 7919) % 50000),
      height = 1 + ((n * 3571) % 50000);
    const result = receiptDimensions(width, height);
    assert.ok(result.width >= 1 && result.width <= Math.min(2000, width));
    assert.ok(result.height >= 1 && result.height <= Math.min(2000, height));
    const scale = Math.min(1, 2000 / Math.max(width, height));
    assert.ok(Math.abs(result.width - width * scale) < 1);
    assert.ok(Math.abs(result.height - height * scale) < 1);
  }
  assert.deepEqual(receiptDimensions(100, 200), { width: 100, height: 200 });
  for (const value of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => receiptDimensions(value, 100), { reason: "unsupported" });
    assert.throws(() => receiptDimensions(100, value), { reason: "unsupported" });
  }
});
test("selection rejects oversized, short or wrong-signature bytes and owns its copy", () => {
  const bytes = pdf(),
    file = checkedReceiptBytes(bytes, "application/pdf");
  bytes.fill(0);
  assert.deepEqual(file.bytes, pdf());
  assert.throws(() => checkedReceiptBytes(new Uint8Array(4194305), "application/pdf"), {
    reason: "too_large",
  });
  assert.throws(() => checkedReceiptBytes(pdf().slice(0, 11), "application/pdf"), {
    reason: "unsupported",
  });
  assert.throws(() => checkedReceiptBytes(pdf(), "image/jpeg"), { reason: "unsupported" });
  const boundary = new Uint8Array(4194304);
  boundary.set(pdf());
  assert.equal(checkedReceiptBytes(boundary, "application/pdf").bytes.length, 4194304);
});
test("selection cancellation creates no upload identity and failures stay finite", async () => {
  const unused = () => {
    throw new Error("must not be called");
  };
  assert.equal(
    await Effect.runPromise(
      receiptSelection({ pick: async () => null, id: unused, digest: unused })("pdf"),
    ),
    null,
  );
  await assert.rejects(
    Effect.runPromise(
      receiptSelection({
        pick: async () => {
          throw new Error("provider secret");
        },
        id,
        digest,
      })("pdf"),
    ),
    { reason: "unavailable" },
  );
  await assert.rejects(
    Effect.runPromise(
      receiptSelection({
        pick: async () => ({ bytes: pdf(), contentType: "application/pdf" }),
        id,
        digest,
      })("photo"),
    ),
    { reason: "unsupported" },
  );
});
test("selected upload identity binds the owned bytes and validates native digest and UUID", async () => {
  const bytes = pdf();
  const selected = await Effect.runPromise(
    receiptSelection({
      pick: async () => ({ bytes, contentType: "application/pdf" }),
      id,
      digest: async (copy) => {
        bytes.fill(0);
        return digest(copy);
      },
    })("pdf"),
  );
  assert.equal(selected.input.sha256, await digest(pdf()));
  assert.equal(selected.input.bytes, pdf().length);
  assert.deepEqual(selected.bytes, pdf());
  for (const patch of [{ id: () => "invalid" }, { digest: async () => "invalid" }]) {
    await assert.rejects(
      Effect.runPromise(
        receiptSelection({
          pick: async () => ({ bytes: pdf(), contentType: "application/pdf" }),
          id,
          digest,
          ...patch,
        })("pdf"),
      ),
      { reason: "unavailable" },
    );
  }
});
