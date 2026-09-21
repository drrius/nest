import assert from "node:assert/strict";
import { test } from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
import { id, payload } from "../../../tests/database/native-expense-helpers.mjs";
test("expense tool result labels a pending proposal without claiming a ledger write", () => {
  const value = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    approval: {
      id: id(100),
      operationId: id(101),
      expense: payload(),
      status: "pending",
      expiresAt: "2026-09-21T12:00:00.000000Z",
      receipt: null,
    },
  };
  const card = actionResult({
    type: "tool-proposeExpense",
    state: "output-available",
    output: { ok: true, value },
  });
  assert.equal(card.label, "Expense proposal pending · no money posted");
  assert.equal(card.href, "/finances");
  assert.match(
    actionResult({ type: "tool-proposeExpense", state: "input-available" }).label,
    /verify/,
  );
});
