import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  RecurringConfiguration,
  RecurringInput,
  ExecuteRecurring,
} from "../../packages/contracts/src/recurring.ts";
import { percentageAllocation } from "../../packages/domain/src/money/allocations.ts";
import { id } from "../database/money-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value);
const base = {
  description: "Synthetic mandate",
  payerId: id(1),
  categoryId: null,
  note: null,
  startDate: "2026-10-01",
  schedule: { kind: "monthly", dayOfMonth: 31 },
};
test("fixed mandate contracts preserve 1,000 exact allocations and variable contracts grant no amount", () => {
  for (let n = 0; n < 1000; n++) {
    const amount = n === 0 ? Number.MAX_SAFE_INTEGER : n * 7919;
    const config = {
      ...base,
      mode: "fixed",
      amountCentimes: String(amount),
      allocations: percentageAllocation(amount, id(1), id(2), (n * 631) % 10001).map((share) => ({
        memberId: share.memberId,
        centimes: String(share.centimes),
      })),
    };
    assert.deepEqual(decode(RecurringConfiguration, config), config);
    assert.throws(() =>
      decode(RecurringConfiguration, { ...config, amountCentimes: String(amount - 1) }),
    );
  }
  const variable = { ...base, mode: "variable", amountCentimes: null, allocations: null };
  assert.deepEqual(decode(RecurringConfiguration, variable), variable);
  assert.throws(() => decode(RecurringConfiguration, { ...variable, amountCentimes: "101" }));
  assert.throws(() => decode(RecurringConfiguration, { ...variable, receiptPath: "hidden" }));
  const rule = {
    ruleId: id(100),
    expectedRevision: null,
    configuration: variable,
    firstDueOn: "2026-10-31",
  };
  assert.deepEqual(decode(RecurringInput, rule), rule);
  assert.throws(() => decode(ExecuteRecurring, { operationId: id(101), rule, approvalId: null }));
  assert.throws(() => decode(RecurringInput, { ...rule, firstDueOn: null }));
});
