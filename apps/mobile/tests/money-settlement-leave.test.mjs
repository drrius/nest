import assert from "node:assert/strict";
import { test } from "node:test";
import { initialSettlementDraft } from "../src/money/settlement-draft.ts";
import { canLeaveSettlement } from "../src/money/settlement-leave.ts";
const initial = initialSettlementDraft("2026-09-21");
const idle = { result: null, attempt: null, busy: false };
test("unchanged full-settlement defaults still warn during dispatch and unresolved recovery", () => {
  assert.equal(canLeaveSettlement(initial, initial, idle), true);
  assert.equal(canLeaveSettlement(initial, initial, { ...idle, busy: true }), false);
  for (const action of ["save", "cancel"])
    assert.equal(canLeaveSettlement(initial, initial, { ...idle, attempt: { action } }), false);
  assert.equal(canLeaveSettlement(initial, { ...initial, amount: "3.00" }, idle), false);
});
test("recorded receipt navigation proceeds even when local terminal cleanup has not finished", () => {
  assert.equal(
    canLeaveSettlement(
      initial,
      { ...initial, note: "Paid" },
      {
        result: { status: "recorded" },
        attempt: { action: "save" },
        busy: true,
      },
    ),
    true,
  );
  assert.equal(
    canLeaveSettlement(initial, initial, {
      ...idle,
      result: { status: "cancelled" },
      attempt: { action: "cancel" },
    }),
    false,
  );
});
