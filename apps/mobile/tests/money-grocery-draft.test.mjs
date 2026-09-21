import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { initialExpenseDraft, parseExpenseDraft } from "../src/money/expense-draft.ts";
import { groceryExpenseSummary } from "../src/money/grocery-expense-display.ts";
import { expenseConfirmation } from "../src/money/approval-display.ts";
import { formatChfField } from "../../../packages/domain/src/money/centimes.ts";
const require = createRequire(new URL("../../../packages/domain/package.json", import.meta.url));
const fc = await import(require.resolve("fast-check"));
const pair = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
const draft = initialExpenseDraft(pair[0], "2026-09-21", true);
test("receipt total never enters allocations across 1000 safe centime shared/total vectors", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
      fc.boolean(),
      (total, reverse) => {
        const shared = Math.floor(total / 2);
        const parsed = parseExpenseDraft(
          {
            ...draft,
            amount: formatChfField(shared),
            receiptTotal: formatChfField(total),
            payerId: pair[reverse ? 1 : 0],
          },
          pair,
        );
        assert.equal(parsed.ok, true);
        assert.equal(parsed.expense.receiptTotalCentimes, String(total));
        assert.equal(parsed.expense.amountCentimes, String(shared));
        assert.equal(
          parsed.expense.allocations.reduce((sum, share) => sum + BigInt(share.centimes), 0n),
          BigInt(shared),
        );
      },
    ),
    { seed: 20260921, numRuns: 1000 },
  );
});
test("grocery form requires an explicit valid total and shared portion; ordinary expenses omit metadata", () => {
  for (const receiptTotal of ["", "0.99", "-1", "1e3", "1.001", "90071992547409.92"])
    assert.equal(parseExpenseDraft({ ...draft, amount: "1.00", receiptTotal }, pair).ok, false);
  assert.equal(parseExpenseDraft({ ...draft, receiptTotal: "10.00" }, pair).ok, false);
  const ordinary = parseExpenseDraft(
    { ...initialExpenseDraft(pair[0], "2026-09-21"), description: "Expense", amount: "1.00" },
    pair,
  );
  assert.equal(ordinary.ok, true);
  assert.equal(Object.hasOwn(ordinary.expense, "receiptTotalCentimes"), false);
});
test("native approval text distinguishes receipt total from the shared amount and retains that distinction in recovery", () => {
  const parsed = parseExpenseDraft({ ...draft, amount: "3.01", receiptTotal: "10.00" }, pair);
  const summary = groceryExpenseSummary(parsed.expense);
  assert.match(summary, /Receipt total: CHF 10.00/);
  assert.match(summary, /Shared amount: CHF 3.01/);
  assert.match(summary, /Only the shared amount affects your balance/);
  assert.ok(expenseConfirmation({ expense: parsed.expense }, pair[0]).includes(summary));
});
