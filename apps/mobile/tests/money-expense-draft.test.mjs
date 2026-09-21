import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { initialExpenseDraft, parseExpenseDraft } from "../src/money/expense-draft.ts";
import { formatChfField } from "../../../packages/domain/src/money/centimes.ts";
const require = createRequire(new URL("../../../packages/domain/package.json", import.meta.url));
const fc = await import(require.resolve("fast-check"));
const pair = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
const base = {
  ...initialExpenseDraft(pair[0], "2026-09-21"),
  description: " Shared expense ",
  amount: "1.01",
};
const share = (expense, member) =>
  BigInt(expense.allocations.find((value) => value.memberId === member).centimes);
test("expense drafts conserve the full safe centime range across both payers and all split modes", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
      fc.integer({ min: 0, max: 10000 }),
      fc.boolean(),
      (amount, percent, otherPays) => {
        const payerId = pair[otherPays ? 1 : 0],
          amountText = formatChfField(amount);
        const equal = parseExpenseDraft({ ...base, amount: amountText, payerId }, pair);
        assert.equal(equal.ok, true);
        assert.equal(BigInt(equal.expense.amountCentimes), BigInt(amount));
        assert.equal(share(equal.expense, payerId), (BigInt(amount) + 1n) / 2n);
        const percentage = parseExpenseDraft(
          {
            ...base,
            amount: amountText.replace(".", ","),
            payerId,
            split: "percentage",
            firstPercent: formatChfField(percent),
          },
          pair,
        );
        assert.equal(percentage.ok, true);
        const first = share(percentage.expense, pair[0]),
          second = share(percentage.expense, pair[1]);
        assert.equal(first + second, BigInt(amount));
        const error = first * 10000n - BigInt(amount) * BigInt(percent);
        assert.ok(error >= -5000n && error <= 5000n);
        if (error === 5000n) assert.equal(payerId, pair[0]);
        if (error === -5000n) assert.equal(payerId, pair[1]);
        const exact = parseExpenseDraft(
          {
            ...base,
            amount: amountText,
            payerId,
            split: "exact",
            firstExact: formatChfField(Number(first)),
            secondExact: formatChfField(Number(second)),
          },
          pair,
        );
        assert.equal(exact.ok, true);
        assert.equal(share(exact.expense, pair[0]), first);
        assert.equal(share(exact.expense, pair[1]), second);
      },
    ),
    { seed: 20260921, numRuns: 1000 },
  );
});
test("expense draft rejects ambiguous amounts, invalid shares, foreign members and unsupported dates/text", () => {
  for (const amount of ["1e2", "-1", "1’000", "1,000", "1.001", "NaN", "90071992547409.92"])
    assert.equal(parseExpenseDraft({ ...base, amount }, pair).ok, false);
  for (const firstPercent of ["100.01", "-1", "50.001", "1e1"])
    assert.equal(parseExpenseDraft({ ...base, split: "percentage", firstPercent }, pair).ok, false);
  for (const patch of [
    { split: "exact", firstExact: "0.50", secondExact: "0.50" },
    { split: "exact", firstExact: "1.02", secondExact: "-0.01" },
    { payerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
    { description: "\u2003" },
    { description: "x".repeat(201) },
    { note: "x".repeat(4001) },
    { note: "\u0000" },
    { date: "2026-02-30" },
    { categoryId: "bad" },
  ])
    assert.equal(parseExpenseDraft({ ...base, ...patch }, pair).ok, false);
  assert.equal(parseExpenseDraft(base, [pair[0], pair[0].toUpperCase()]).ok, false);
});
test("payer changes preserve person-specific exact/percentage fields; canonical input preserves Unicode boundaries", () => {
  const draft = {
    ...base,
    description: "🥣".repeat(200),
    note: "🍽️".repeat(2000),
    payerId: pair[1].toUpperCase(),
    categoryId: pair[0].toUpperCase(),
    split: "percentage",
    firstPercent: "100",
  };
  const value = parseExpenseDraft(
    draft,
    pair.map((id) => id.toUpperCase()),
  );
  assert.equal(value.ok, true);
  assert.equal(value.expense.payerId, pair[1]);
  assert.equal(value.expense.categoryId, pair[0]);
  assert.equal(share(value.expense, pair[0]), 101n);
  assert.equal(share(value.expense, pair[1]), 0n);
  assert.equal(parseExpenseDraft({ ...base, note: "  " }, pair).expense.note, null);
});
