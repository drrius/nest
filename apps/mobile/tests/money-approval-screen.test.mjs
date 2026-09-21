import assert from "node:assert/strict";
import { test } from "node:test";
import { approvalActions, expenseConfirmation } from "../src/money/approval-display.ts";
import { expenseApprovalOwner } from "../src/money/approval-owner.ts";
import { fixture, pending, intent, id, Effect } from "./money-approval-fixture.mjs";
import { ExpenseApprovalRuntime } from "../src/money/approval-runtime.ts";
test("confirmation copy preserves exact centimes and payer; stale, expired and uncertain views cannot create a new decision", () => {
  const approval = {
    ...pending,
    expense: {
      ...pending.expense,
      amountCentimes: "9007199254740991",
      allocations: [
        { memberId: id(1), centimes: "9007199254740990" },
        { memberId: id(2), centimes: "1" },
      ],
    },
  };
  const text = expenseConfirmation(approval, id(1));
  assert.match(text, /CHF 90’071’992’547’409\.91/);
  assert.match(text, /Your partner: CHF 0\.01/);
  assert.match(text, /Paid by you/);
  const view = {
    approval,
    category: null,
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
    owner = expenseApprovalOwner(f.operations, pending.id);
  assert.equal(owner.getSnapshot(), null);
  const stop = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  await first.setActive(true);
  assert.notEqual(first.getSnapshot().approval, null);
  stop();
  assert.equal(first.getSnapshot().approval, null);
  assert.equal(owner.getSnapshot(), null);
  const again = owner.subscribe(() => {}),
    second = owner.getSnapshot();
  assert.notEqual(second, first);
  await second.setActive(true);
  assert.equal(second.getSnapshot().fresh, true);
  again();
});
test("archived or missing expense category blocks confirmation but allows declining", async (t) => {
  const f = await fixture(t);
  const approval = { ...pending, expense: { ...pending.expense, categoryId: id(500) } };
  for (const category of [null, { categoryId: id(500), name: "Home", archived: true }]) {
    const runtime = new ExpenseApprovalRuntime(
      {
        ...f.operations,
        read: () => Effect.succeed(approval),
        category: () => Effect.succeed(category),
      },
      pending.id,
      () => 1,
    );
    await runtime.setActive(true);
    assert.equal(approvalActions(runtime.getSnapshot(), 1).confirm, false);
    assert.equal(approvalActions(runtime.getSnapshot(), 1).deny, true);
    await runtime.decide(runtime.getSnapshot().approval, true);
    assert.equal(f.calls(), 0);
    runtime.dispose();
  }
});
