import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  CorrectionInput,
  CorrectionReceipt,
  canonicalCorrection,
} from "../../packages/contracts/src/correction.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const domainRequire = createRequire(new URL("../../packages/domain/package.json", import.meta.url));
const fc = await import(domainRequire.resolve("fast-check"));
const ids = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
];
const input = (amount) => ({
  sourceEventId: ids[2],
  expectedReversalId: null,
  replacement: {
    kind: "expense",
    expense: {
      description: "Correction",
      amountCentimes: String(amount),
      payerId: ids[0],
      allocations: [
        { memberId: ids[0], centimes: "0" },
        { memberId: ids[1], centimes: String(amount) },
      ],
      date: "2026-09-21",
      note: null,
      categoryId: null,
    },
  },
});
test("correction expense replacements retain exact centime sums and canonical identities over 1000 vectors", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (amount) => {
      const value = input(amount);
      assert.equal(Schema.is(CorrectionInput)(value), true);
      assert.equal(
        Schema.is(CorrectionInput)({
          ...value,
          replacement: {
            kind: "expense",
            expense: { ...value.replacement.expense, amountCentimes: String(BigInt(amount) + 1n) },
          },
        }),
        false,
      );
      const upper = JSON.parse(
        JSON.stringify(value).replaceAll(/[a-d]{8}-[a-d]{4}-4[a-d]{3}-8[a-d]{3}-[a-d]{12}/g, (s) =>
          s.toUpperCase(),
        ),
      );
      assert.deepEqual(canonicalCorrection(upper), value);
    }),
    { seed: 20260921, numRuns: 1000 },
  );
});
test("opening repair and receipt lineage reject self-links, missing replacement and changed reversal", () => {
  const repair = {
    sourceEventId: ids[2],
    expectedReversalId: ids[3],
    replacement: {
      kind: "opening_balance",
      opening: {
        description: "Opening repair",
        amountCentimes: "100",
        payerId: ids[0],
        date: "2026-09-21",
        note: null,
      },
    },
  };
  assert.equal(Schema.is(CorrectionInput)(repair), true);
  assert.equal(Schema.is(CorrectionInput)({ ...repair, replacement: null }), false);
  assert.equal(Schema.is(CorrectionInput)({ ...repair, expectedReversalId: ids[2] }), false);
  assert.deepEqual(
    canonicalCorrection({
      ...repair,
      expectedReversalId: ids[3].toUpperCase(),
      replacement: {
        ...repair.replacement,
        opening: { ...repair.replacement.opening, payerId: ids[0].toUpperCase() },
      },
    }),
    repair,
  );
  const receipt = {
    version: 1,
    actorId: ids[0],
    householdId: ids[0],
    operationId: ids[1],
    approvalId: null,
    correction: repair,
    reversalEventId: ids[3],
    replacementEventId: ids[1],
  };
  assert.equal(Schema.is(CorrectionReceipt)(receipt), true);
  for (const patch of [
    { replacementEventId: null },
    { replacementEventId: ids[2] },
    { replacementEventId: ids[3] },
    { reversalEventId: ids[1] },
  ])
    assert.equal(Schema.is(CorrectionReceipt)({ ...receipt, ...patch }), false);
});
