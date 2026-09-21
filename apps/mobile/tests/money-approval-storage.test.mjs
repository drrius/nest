import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, run, account, lease } from "./offline-fixture.mjs";
import { intent, pending, id } from "./money-approval-fixture.mjs";
test("approval recovery metadata is private, survives SQLite restart and serializes opposing decisions", async (t) => {
  const f = await fixture(t),
    session = f.session;
  const results = await Promise.allSettled([
    run(f.store.stageExpenseApproval(session, intent, () => true)),
    run(f.store.stageExpenseApproval(session, { ...intent, approved: false }, () => true)),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    results.find((result) => result.status === "rejected").reason.reason,
    "pending_edit",
  );
  const saved = await run(f.store.readExpenseApproval(session, pending.id));
  assert.deepEqual(Object.keys(saved).sort(), ["approvalId", "approved", "operationId"]);
  await assert.rejects(
    run(f.store.clearExpenseApproval(session, { ...saved, approved: !saved.approved })),
    { reason: "operation_reused" },
  );
  const reopened = f.reopen();
  assert.deepEqual(await run(reopened.store.readExpenseApproval(session, pending.id)), saved);
  const partner = await run(reopened.store.activate({ ...account, actor: id(2) }, id(3)));
  assert.equal(await run(reopened.store.readExpenseApproval(partner, pending.id)), null);
  await assert.rejects(run(reopened.store.stageExpenseApproval(session, intent, () => true)), {
    reason: "session_changed",
  });
  const original = await run(reopened.store.activate(account, id(4)));
  assert.deepEqual(await run(reopened.store.readExpenseApproval(original, pending.id)), saved);
  await run(reopened.store.clearExpenseApproval(original, saved));
  assert.equal(await run(reopened.store.readExpenseApproval(original, pending.id)), null);
});
test("cancelled and corrupt recovery metadata cannot substitute a financial decision", async (t) => {
  const f = await fixture(t);
  await assert.rejects(run(f.store.stageExpenseApproval(f.session, intent, () => false)), {
    reason: "cancelled",
  });
  assert.equal(await run(f.store.readExpenseApproval(f.session, pending.id)), null);
  await assert.rejects(
    run(
      f.store.stageExpenseApproval(
        f.session,
        { ...intent, expense: "private content" },
        () => true,
      ),
    ),
    { reason: "storage" },
  );
  await run(f.store.stageExpenseApproval(f.session, intent, () => true));
  f.connection
    .prepare("UPDATE expense_approval_attempts SET data=?")
    .run(JSON.stringify({ ...intent, approvalId: id(999) }));
  await assert.rejects(run(f.store.readExpenseApproval(f.session, pending.id)), {
    reason: "invalid_input",
  });
  const otherHome = await run(f.store.activate({ ...account, household: id(11) }, lease));
  assert.equal(await run(f.store.readExpenseApproval(otherHome, pending.id)), null);
});
