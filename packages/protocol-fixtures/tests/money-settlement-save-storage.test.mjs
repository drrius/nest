import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, run, account, lease } from "./offline-fixture.mjs";
import { attempt, id } from "./money-settlement-save-fixture.mjs";
test("direct Save recovery keeps one exact command per account across restart and opposing decisions", async (t) => {
  const f = await fixture(t),
    session = f.session;
  const changed = { ...attempt, command: { ...attempt.command, operationId: id(200) } };
  const outcomes = await Promise.allSettled([
    run(f.store.stageSettlementSave(session, attempt, () => true)),
    run(f.store.stageSettlementSave(session, changed, () => true)),
  ]);
  assert.equal(outcomes.filter((value) => value.status === "fulfilled").length, 1);
  const saved = await run(f.store.readSettlementSave(session));
  const reopened = f.reopen();
  assert.deepEqual(await run(reopened.store.readSettlementSave(session)), saved);
  const cancelled = { ...saved, action: "cancel" };
  await run(reopened.store.stageSettlementSave(session, cancelled, () => true));
  await assert.rejects(run(reopened.store.stageSettlementSave(session, saved, () => true)), {
    reason: "pending_edit",
  });
  await assert.rejects(run(reopened.store.clearSettlementSave(session, saved)), {
    reason: "operation_reused",
  });
  const partner = await run(reopened.store.activate({ ...account, actor: id(2) }, id(3)));
  assert.equal(await run(reopened.store.readSettlementSave(partner)), null);
  await assert.rejects(run(reopened.store.readSettlementSave(session)), {
    reason: "session_changed",
  });
  const original = await run(reopened.store.activate(account, id(4)));
  assert.deepEqual(await run(reopened.store.readSettlementSave(original)), cancelled);
  await run(reopened.store.clearSettlementSave(original, cancelled));
  assert.equal(await run(reopened.store.readSettlementSave(original)), null);
});
test("invalid, stale and corrupt Save recovery never authorizes a substitute command", async (t) => {
  const f = await fixture(t),
    session = f.session;
  await assert.rejects(run(f.store.stageSettlementSave(session, attempt, () => false)), {
    reason: "cancelled",
  });
  await assert.rejects(
    run(f.store.stageSettlementSave(session, { ...attempt, action: "cancel" }, () => true)),
    { reason: "invalid_input" },
  );
  await assert.rejects(
    run(f.store.stageSettlementSave(session, { ...attempt, actorId: id(2) }, () => true)),
    { reason: "storage" },
  );
  assert.equal(await run(f.store.readSettlementSave(session)), null);
  await run(f.store.stageSettlementSave(session, attempt, () => true));
  const changed = {
    ...attempt,
    command: {
      ...attempt.command,
      settlement: { ...attempt.command.settlement, note: "Different" },
    },
  };
  await assert.rejects(run(f.store.stageSettlementSave(session, changed, () => true)), {
    reason: "pending_edit",
  });
  f.connection.prepare("UPDATE settlement_save_attempts SET data=?").run('{"command":false}');
  await assert.rejects(run(f.store.readSettlementSave(session)), { reason: "storage" });
  const otherHome = await run(f.store.activate({ ...account, household: id(11) }, lease));
  assert.equal(await run(f.store.readSettlementSave(otherHome)), null);
});
