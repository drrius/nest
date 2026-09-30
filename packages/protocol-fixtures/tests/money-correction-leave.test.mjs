import assert from "node:assert/strict";
import { test } from "node:test";
import { initialCorrectionDraft } from "../src/money/correction-draft.ts";
import { canLeaveCorrection } from "../src/money/correction-leave.ts";
import { context } from "./money-correction-draft-fixture.mjs";
const initial = initialCorrectionDraft(context(1000));
const idle = { result: null, attempt: null, busy: false };
test("unchanged full-correction defaults still warn during dispatch and unresolved recovery", () => {
  assert.equal(canLeaveCorrection(initial, initial, idle), true);
  assert.equal(canLeaveCorrection(initial, initial, { ...idle, busy: true }), false);
  for (const action of ["save", "cancel"])
    assert.equal(canLeaveCorrection(initial, initial, { ...idle, attempt: { action } }), false);
  assert.equal(canLeaveCorrection(initial, { ...initial, amount: "3.00" }, idle), false);
});
test("recorded receipt navigation proceeds even when local terminal cleanup has not finished", () => {
  assert.equal(
    canLeaveCorrection(
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
    canLeaveCorrection(initial, initial, {
      ...idle,
      result: { status: "cancelled" },
      attempt: { action: "cancel" },
    }),
    false,
  );
});
