import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { ExpenseInput } from "../../packages/contracts/src/expense.ts";
import { CorrectionInput } from "../../packages/contracts/src/correction.ts";
import { matchesExpenseProposal } from "../../apps/api/src/money/expense-proposal.ts";
import { payload, id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const path = `${id(10)}/receipts/${id(100)}.jpg`;
test("receipt reference is strict and cannot silently change a correction's retained attachment", () => {
  const decode = (value) =>
    Schema.decodeUnknownSync(ExpenseInput)(value, { onExcessProperty: "error" });
  assert.deepEqual(decode(payload({ receiptPath: path })), payload({ receiptPath: path }));
  for (const receiptPath of [
    null,
    "",
    path.toUpperCase(),
    path.replace("/receipts/", "/documents/"),
    `https://example.test/${path}`,
    `../${path}`,
  ])
    assert.throws(() => decode(payload({ receiptPath })));
  assert.equal(
    Schema.is(CorrectionInput)({
      sourceEventId: id(200),
      expectedReversalId: null,
      replacement: { kind: "expense", expense: payload({ receiptPath: path }) },
    }),
    false,
  );
});
test("AI proposal receipt matcher rejects a substituted attachment or omitted reviewed reference", () => {
  const input = payload({ receiptPath: path });
  const result = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    approval: {
      id: id(201),
      operationId: id(202),
      expense: input,
      status: "pending",
      expiresAt: "2030-01-01T00:00:00.000000Z",
      receipt: null,
    },
  };
  const member = { userId: id(1), householdId: id(10) };
  assert.equal(matchesExpenseProposal(input, result, member), true);
  for (const expense of [payload(), payload({ receiptPath: `${id(10)}/receipts/${id(101)}.jpg` })])
    assert.equal(
      matchesExpenseProposal(
        input,
        { ...result, approval: { ...result.approval, expense } },
        member,
      ),
      false,
    );
});
