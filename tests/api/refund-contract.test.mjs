import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  RefundInput,
  RefundReceipt,
  canonicalRefund,
} from "../../packages/contracts/src/refund.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const domainRequire = createRequire(new URL("../../packages/domain/package.json", import.meta.url));
const fc = await import(domainRequire.resolve("fast-check"));
const pair = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
const source = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const shares = (first, second) => [
  { memberId: pair[0], centimes: String(first) },
  { memberId: pair[1], centimes: String(second) },
];
const input = (amount) => ({
  sourceEventId: source,
  description: "Refund",
  amountCentimes: String(amount),
  payerId: pair[0],
  allocations: shares(0, amount),
  expectedRemaining: shares(0, amount),
  date: "2026-09-21",
  note: null,
});
test("refund contract binds exact per-person ceilings over 1000 safe-centime vectors", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      fc.boolean(),
      (amount, reverse) => {
        const first = Math.floor(amount / 2),
          second = amount - first;
        const value = {
          ...input(amount),
          allocations: shares(first, second),
          expectedRemaining: shares(first, second),
          payerId: pair[reverse ? 1 : 0],
        };
        assert.equal(Schema.is(RefundInput)(value), true);
        assert.equal(
          Schema.is(RefundInput)({ ...value, allocations: shares(first + 1, second - 1) }),
          false,
        );
        const partial = {
          ...value,
          amountCentimes: String(second),
          allocations: shares(0, second),
        };
        assert.equal(Schema.is(RefundInput)(partial), true);
      },
    ),
    { seed: 20260921, numRuns: 1000 },
  );
});
test("refund contract rejects zero, changed membership, duplicated caps, malformed dates and receipt self-links", () => {
  const valid = input(100);
  for (const patch of [
    { amountCentimes: "0", allocations: shares(0, 0) },
    { payerId: source },
    { expectedRemaining: [valid.expectedRemaining[0], valid.expectedRemaining[0]] },
    { expectedRemaining: shares(Number.MAX_SAFE_INTEGER, 1) },
    { amountCentimes: "1e2" },
    { date: "2026-02-30" },
  ])
    assert.equal(Schema.is(RefundInput)({ ...valid, ...patch }), false);
  const canonical = canonicalRefund({
    ...valid,
    payerId: pair[0].toUpperCase(),
    sourceEventId: source.toUpperCase(),
    allocations: valid.allocations.map((share) => ({
      ...share,
      memberId: share.memberId.toUpperCase(),
    })),
  });
  assert.deepEqual(canonical, valid);
  const receipt = {
    version: 1,
    actorId: pair[0],
    householdId: pair[0],
    operationId: pair[1],
    eventId: pair[1],
    approvalId: null,
    refund: valid,
  };
  assert.equal(Schema.is(RefundReceipt)(receipt), true);
  assert.equal(Schema.is(RefundReceipt)({ ...receipt, eventId: source }), false);
  assert.equal(Schema.is(RefundReceipt)({ ...receipt, actorId: source }), false);
});
