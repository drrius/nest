import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalActions, refundConfirmation } from "../src/money/refund-approval-display.ts";
import { refundApprovalOwner } from "../src/money/refund-approval-owner.ts";
import { fixture, pending, intent, id } from "./money-refund-approval-fixture.mjs";
test("confirmation copy preserves exact centimes and payer; stale, expired and uncertain views cannot create a new decision", () => {
  const approval = {
    ...pending,
    refund: {
      ...pending.refund,
      amountCentimes: "9007199254740991",
      allocations: [
        { memberId: id(1), centimes: "0" },
        { memberId: id(2), centimes: "9007199254740991" },
      ],
      expectedRemaining: [
        { memberId: id(1), centimes: "0" },
        { memberId: id(2), centimes: "9007199254740991" },
      ],
    },
  };
  const text = refundConfirmation(approval, id(1));
  assert.match(text, /CHF 90’071’992’547’409\.91/);
  assert.match(text, /Original payer: You/);
  assert.match(text, /Reviewed remaining shares/);
  const view = {
    approval,
    online: true,
    attempt: null,
    active: true,
    busy: false,
    fresh: true,
    verify: false,
    notice: null,
  };
  assert.equal(approvalActions(view, 1).confirm, true);
  for (const patch of [
    { fresh: false },
    { online: false },
    { active: false },
    { busy: true },
    { verify: true },
    { attempt: intent },
  ])
    assert.equal(approvalActions({ ...view, ...patch }, 1).confirm, false);
  assert.equal(approvalActions(view, Date.parse(approval.expiresAt)).confirm, false);
  assert.equal(
    approvalActions({ ...view, attempt: intent }, Date.parse(approval.expiresAt)).retry,
    true,
  );
});
test("approval owner recreates a live runtime after unsubscribe and clears private content", async (t) => {
  const f = await fixture(t),
    owner = refundApprovalOwner(f.operations, pending.id);
  assert.equal(owner.getSnapshot(), null);
  const stop = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  await first.setOnline(true);
  await first.setActive(true);
  assert.notEqual(first.getSnapshot().approval, null);
  stop();
  assert.equal(first.getSnapshot().approval, null);
  assert.equal(owner.getSnapshot(), null);
  const again = owner.subscribe(() => {}),
    second = owner.getSnapshot();
  assert.notEqual(second, first);
  await second.setOnline(true);
  await second.setActive(true);
  assert.equal(second.getSnapshot().fresh, true);
  again();
});
