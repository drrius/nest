import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
import {
  ExpenseInput,
  ExpenseReceipt,
  ExecuteExpense,
} from "../../packages/contracts/src/expense.ts";
import { percentageAllocation } from "../../packages/domain/src/money/allocations.ts";
import { payload, id } from "../database/native-expense-helpers.mjs";
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value);
test("expense schema preserves 1000 exact percentage allocations including the safe endpoint", () => {
  for (let n = 0; n < 1000; n++) {
    const amount = n === 0 ? Number.MAX_SAFE_INTEGER : n * 7919;
    const allocations = percentageAllocation(amount, id(1), id(2), (n * 631) % 10001).map(
      (share) => ({ memberId: share.memberId, centimes: String(share.centimes) }),
    );
    const input = payload({ amountCentimes: String(amount), allocations });
    assert.deepEqual(decode(ExpenseInput, input), input);
  }
});
test("expense contract rejects malformed money, hidden origin, false approval and mismatched roster", () => {
  for (const value of [
    payload({ note: "x".repeat(4001) }),
    payload({ origin: "ui" }),
    payload({ amountCentimes: 101 }),
    payload({ amountCentimes: "9007199254740992" }),
    payload({ date: "2026-02-30" }),
    payload({ note: "\u0000" }),
    payload({ description: "\ud800" }),
    payload({ payerId: id(3) }),
    payload({
      allocations: [
        { memberId: id(1), centimes: "51" },
        { memberId: id(2), centimes: "49" },
      ],
    }),
  ]) {
    assert.throws(() => decode(ExpenseInput, value));
  }
  assert.throws(() =>
    decode(ExecuteExpense, { operationId: id(100), expense: payload(), approvalId: null }),
  );
  assert.throws(() =>
    decode(ExpenseReceipt, {
      version: 1,
      actorId: id(3),
      householdId: id(10),
      operationId: id(100),
      eventId: id(101),
      approvalId: null,
      expense: payload(),
    }),
  );
});

test("expense text limits count Unicode codepoints consistently with retained PostgreSQL fields", () => {
  const value = payload({ description: "😀".repeat(200), note: "😀".repeat(4000) });
  assert.deepEqual(decode(ExpenseInput, value), value);
  assert.throws(() => decode(ExpenseInput, payload({ description: "😀".repeat(201) })));
  assert.throws(() => decode(ExpenseInput, payload({ note: "😀".repeat(4001) })));
  assert.throws(() => decode(ExpenseInput, payload({ description: "\u00a0\u2000\ufeff" })));
});
