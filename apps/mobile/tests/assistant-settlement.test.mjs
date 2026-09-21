import assert from "node:assert/strict";
import { test } from "node:test";
import { actionResult } from "../src/assistant/action-result.ts";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
import { settlement as payload } from "../../../tests/integration/settlement-api-fixture.mjs";
test("settlement tool result describes its historical action without asserting current approval status", () => {
  const value = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    approval: {
      id: id(100),
      operationId: id(101),
      settlement: payload(),
      status: "pending",
      expiresAt: "2026-09-21T12:00:00.000000Z",
      receipt: null,
    },
  };
  const card = actionResult({
    type: "tool-proposeSettlement",
    state: "output-available",
    output: { ok: true, value },
  });
  assert.equal(card.label, "Settlement proposal created · this action posted no money");
  assert.deepEqual(card.href, {
    pathname: "/settlement-approval",
    params: { approvalId: value.approval.id },
  });
  assert.match(
    actionResult({ type: "tool-proposeSettlement", state: "input-available" }).label,
    /verify/,
  );
});
