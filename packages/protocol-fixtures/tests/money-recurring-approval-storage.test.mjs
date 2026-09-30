import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, run, account, lease } from "./offline-fixture.mjs";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
const pending = { id: id(100) };
const intent = { approvalId: pending.id, operationId: id(101), approved: true };
test("approval recovery metadata is private, survives SQLite restart and serializes opposing decisions", async (t) => {
  const f = await fixture(t),
    session = f.session;
  const results = await Promise.allSettled([
    run(f.store.stageRecurringApproval(session, intent, () => true)),
    run(f.store.stageRecurringApproval(session, { ...intent, approved: false }, () => true)),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    results.find((result) => result.status === "rejected").reason.reason,
    "pending_edit",
  );
  const saved = await run(f.store.readRecurringApproval(session, pending.id));
  assert.deepEqual(Object.keys(saved).sort(), ["approvalId", "approved", "operationId"]);
  await assert.rejects(
    run(f.store.clearRecurringApproval(session, { ...saved, approved: !saved.approved })),
    { reason: "operation_reused" },
  );
  const reopened = f.reopen();
  assert.deepEqual(await run(reopened.store.readRecurringApproval(session, pending.id)), saved);
  const partner = await run(reopened.store.activate({ ...account, actor: id(2) }, id(3)));
  assert.equal(await run(reopened.store.readRecurringApproval(partner, pending.id)), null);
  await assert.rejects(run(reopened.store.stageRecurringApproval(session, intent, () => true)), {
    reason: "session_changed",
  });
  const original = await run(reopened.store.activate(account, id(4)));
  assert.deepEqual(await run(reopened.store.readRecurringApproval(original, pending.id)), saved);
  await run(reopened.store.clearRecurringApproval(original, saved));
  assert.equal(await run(reopened.store.readRecurringApproval(original, pending.id)), null);
});
test("cancelled and corrupt recovery metadata cannot substitute a financial decision", async (t) => {
  const f = await fixture(t);
  await assert.rejects(run(f.store.stageRecurringApproval(f.session, intent, () => false)), {
    reason: "cancelled",
  });
  assert.equal(await run(f.store.readRecurringApproval(f.session, pending.id)), null);
  await assert.rejects(
    run(
      f.store.stageRecurringApproval(
        f.session,
        { ...intent, recurring: "private content" },
        () => true,
      ),
    ),
    { reason: "storage" },
  );
  await run(f.store.stageRecurringApproval(f.session, intent, () => true));
  f.connection
    .prepare("UPDATE recurring_approval_attempts SET data=?")
    .run(JSON.stringify({ ...intent, approvalId: id(999) }));
  await assert.rejects(run(f.store.readRecurringApproval(f.session, pending.id)), {
    reason: "invalid_input",
  });
  const otherHome = await run(f.store.activate({ ...account, household: id(11) }, lease));
  assert.equal(await run(f.store.readRecurringApproval(otherHome, pending.id)), null);
});
