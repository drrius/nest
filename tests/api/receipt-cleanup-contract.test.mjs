import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = require("effect/Schema");
import { ReceiptUploadCleanup } from "../../packages/contracts/src/receipt-upload.ts";
const householdId = "00000000-0000-4000-8000-000000000010",
  uploadId = "00000000-0000-4000-8000-000000000100";
test("cleanup acknowledgment binds exact household upload path and finite status", () => {
  const result = {
    version: 1,
    householdId,
    uploadId,
    path: `${householdId}/receipts/${uploadId}.pdf`,
    status: "deleted",
  };
  for (const status of ["claimed", "deleting", "deleted"])
    assert.equal(Schema.is(ReceiptUploadCleanup)({ ...result, status }), true);
  for (const patch of [
    { status: "pending" },
    { version: 2 },
    { uploadId: householdId },
    { path: result.path.replace("receipts", "files") },
    { path: result.path + "?token=secret" },
  ])
    assert.equal(Schema.is(ReceiptUploadCleanup)({ ...result, ...patch }), false);
});
