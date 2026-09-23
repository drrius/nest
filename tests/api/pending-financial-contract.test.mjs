import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { PendingFinancialApprovals } from "../../packages/contracts/src/pending-financial-approvals.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n) => ({
  approvalId: id(n),
  command: "expenses.record",
  expiresAt: "2026-09-23T12:00:00.000000Z",
});
const page = { version: 1, householdId: id(10), actorId: id(1), approvals: [row(100)], next: null };
const decode = (value) =>
  Schema.decodeUnknownSync(PendingFinancialApprovals)(value, { onExcessProperty: "error" });
test("pending approval boundary rejects payloads, invalid paging and unrelated commands", () => {
  assert.deepEqual(decode(page), page);
  for (const value of [
    { ...page, approvals: [{ ...row(100), payload: { amount: 100 } }] },
    { ...page, approvals: [{ ...row(100), command: "memory.save" }] },
    { ...page, approvals: [row(100), row(100)] },
    { ...page, approvals: [row(101), row(100)] },
    { ...page, next: id(100) },
    { ...page, approvals: [{ ...row(100), expiresAt: "infinity" }] },
  ])
    assert.throws(() => decode(value));
  const full = {
    ...page,
    approvals: Array.from({ length: 20 }, (_, i) => row(100 + i)),
    next: id(119),
  };
  assert.deepEqual(decode(full), full);
  assert.throws(() => decode({ ...full, next: id(118) }));
});
