import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, run, account, lease } from "./offline-fixture.mjs";
import { attempt, id } from "./money-refund-save-fixture.mjs";
test("direct Save recovery keeps one exact command per account across restart and opposing decisions", async (t) => {
  const f = await fixture(t),
    session = f.session;
  const changed = { ...attempt, command: { ...attempt.command, operationId: id(200) } };
  const outcomes = await Promise.allSettled([
    run(f.store.stageRefundSave(session, attempt, () => true)),
    run(f.store.stageRefundSave(session, changed, () => true)),
  ]);
  assert.equal(outcomes.filter((value) => value.status === "fulfilled").length, 1);
  const saved = await run(f.store.readRefundSave(session));
  const reopened = f.reopen();
  assert.deepEqual(await run(reopened.store.readRefundSave(session)), saved);
  const cancelled = { ...saved, action: "cancel" };
  await run(reopened.store.stageRefundSave(session, cancelled, () => true));
  await assert.rejects(run(reopened.store.stageRefundSave(session, saved, () => true)), {
    reason: "pending_edit",
  });
  await assert.rejects(run(reopened.store.clearRefundSave(session, saved)), {
    reason: "operation_reused",
  });
  const partner = await run(reopened.store.activate({ ...account, actor: id(2) }, id(3)));
  assert.equal(await run(reopened.store.readRefundSave(partner)), null);
  await assert.rejects(run(reopened.store.readRefundSave(session)), {
    reason: "session_changed",
  });
  const original = await run(reopened.store.activate(account, id(4)));
  assert.deepEqual(await run(reopened.store.readRefundSave(original)), cancelled);
  await run(reopened.store.clearRefundSave(original, cancelled));
  assert.equal(await run(reopened.store.readRefundSave(original)), null);
});
test("invalid, stale and corrupt Save recovery never authorizes a substitute command", async (t) => {
  const f = await fixture(t),
    session = f.session;
  await assert.rejects(run(f.store.stageRefundSave(session, attempt, () => false)), {
    reason: "cancelled",
  });
  await assert.rejects(
    run(f.store.stageRefundSave(session, { ...attempt, action: "cancel" }, () => true)),
    { reason: "invalid_input" },
  );
  await assert.rejects(
    run(f.store.stageRefundSave(session, { ...attempt, actorId: id(2) }, () => true)),
    { reason: "storage" },
  );
  assert.equal(await run(f.store.readRefundSave(session)), null);
  await run(f.store.stageRefundSave(session, attempt, () => true));
  const changed = {
    ...attempt,
    command: {
      ...attempt.command,
      refund: { ...attempt.command.refund, note: "Different" },
    },
  };
  await assert.rejects(run(f.store.stageRefundSave(session, changed, () => true)), {
    reason: "pending_edit",
  });
  f.connection.prepare("UPDATE refund_save_attempts SET data=?").run('{"command":false}');
  await assert.rejects(run(f.store.readRefundSave(session)), { reason: "storage" });
  const otherHome = await run(f.store.activate({ ...account, household: id(11) }, lease));
  assert.equal(await run(f.store.readRefundSave(otherHome)), null);
});
