import assert from "node:assert/strict";
import { test } from "node:test";
import { initialRefundDraft } from "../src/money/refund-draft.ts";
import { canLeaveRefund } from "../src/money/refund-leave.ts";
const initial = initialRefundDraft("2026-09-21");
const idle = { result: null, attempt: null, busy: false };
test("unchanged full-refund defaults still warn during dispatch and unresolved recovery", () => {
  assert.equal(canLeaveRefund(initial, initial, idle), true);
  assert.equal(canLeaveRefund(initial, initial, { ...idle, busy: true }), false);
  for (const action of ["save", "cancel"])
    assert.equal(canLeaveRefund(initial, initial, { ...idle, attempt: { action } }), false);
  assert.equal(canLeaveRefund(initial, { ...initial, own: "3.00" }, idle), false);
});
test("recorded receipt navigation proceeds even when local terminal cleanup has not finished", () => {
  assert.equal(
    canLeaveRefund(
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
    canLeaveRefund(initial, initial, {
      ...idle,
      result: { status: "cancelled" },
      attempt: { action: "cancel" },
    }),
    false,
  );
});
