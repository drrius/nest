import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = require("effect/Schema");
const {
  ReceiptUploadInput,
  ReceiptUploadReservation,
  canonicalReceiptUpload,
} = require("@nest/contracts/receipt-upload");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = { uploadId: id(100), sha256: "a".repeat(64), bytes: 128, contentType: "image/jpeg" };
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
test("receipt upload contracts bound file identity and reject caller authority injection", () => {
  assert.deepEqual(decode(ReceiptUploadInput, input), input);
  for (const patch of [
    { bytes: 0 },
    { bytes: 4194305 },
    { bytes: 12.5 },
    { bytes: "128" },
    { sha256: "a".repeat(63) },
    { contentType: "image/png" },
    { path: "arbitrary" },
    { householdId: id(10) },
    { uploaderId: id(1) },
  ])
    assert.throws(() => decode(ReceiptUploadInput, { ...input, ...patch }));
  const mixed = { ...input, uploadId: "abcdef00-0000-4000-8000-000000000001".toUpperCase() };
  assert.equal(canonicalReceiptUpload(mixed).uploadId, mixed.uploadId.toLowerCase());
});
test("reservation requires exact household, object ID and canonical MIME extension", () => {
  const response = {
    ...input,
    version: 1,
    householdId: id(10),
    uploaderId: id(1),
    path: `${id(10)}/receipts/${input.uploadId}.jpg`,
    stored: false,
  };
  assert.deepEqual(decode(ReceiptUploadReservation, response), response);
  for (const patch of [
    { path: response.path.replace(".jpg", ".pdf") },
    { householdId: id(20) },
    { uploadId: id(101) },
    { path: response.path.replace("receipts", "documents") },
    { stored: null },
    { signedUrl: "https://foreign.example" },
  ])
    assert.throws(() => decode(ReceiptUploadReservation, { ...response, ...patch }));
});
