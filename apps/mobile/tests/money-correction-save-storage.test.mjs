import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, run, account, lease } from "./offline-fixture.mjs";
import { attempt, id } from "./money-correction-save-fixture.mjs";
test("direct Save recovery keeps one exact command per account across restart and opposing decisions", async (t) => {
  const f = await fixture(t),
    session = f.session;
  const changed = { ...attempt, command: { ...attempt.command, operationId: id(200) } };
  const outcomes = await Promise.allSettled([
    run(f.store.stageCorrectionSave(session, attempt, () => true)),
    run(f.store.stageCorrectionSave(session, changed, () => true)),
  ]);
  assert.equal(outcomes.filter((value) => value.status === "fulfilled").length, 1);
  const saved = await run(f.store.readCorrectionSave(session));
  const reopened = f.reopen();
  assert.deepEqual(await run(reopened.store.readCorrectionSave(session)), saved);
  const cancelled = { ...saved, action: "cancel" };
  await run(reopened.store.stageCorrectionSave(session, cancelled, () => true));
  await assert.rejects(run(reopened.store.stageCorrectionSave(session, saved, () => true)), {
    reason: "pending_edit",
  });
  await assert.rejects(run(reopened.store.clearCorrectionSave(session, saved)), {
    reason: "operation_reused",
  });
  const partner = await run(reopened.store.activate({ ...account, actor: id(2) }, id(3)));
  assert.equal(await run(reopened.store.readCorrectionSave(partner)), null);
  await assert.rejects(run(reopened.store.readCorrectionSave(session)), {
    reason: "session_changed",
  });
  const original = await run(reopened.store.activate(account, id(4)));
  assert.deepEqual(await run(reopened.store.readCorrectionSave(original)), cancelled);
  await run(reopened.store.clearCorrectionSave(original, cancelled));
  assert.equal(await run(reopened.store.readCorrectionSave(original)), null);
});
test("invalid, stale and corrupt Save recovery never authorizes a substitute command", async (t) => {
  const f = await fixture(t),
    session = f.session;
  await assert.rejects(run(f.store.stageCorrectionSave(session, attempt, () => false)), {
    reason: "cancelled",
  });
  await assert.rejects(
    run(f.store.stageCorrectionSave(session, { ...attempt, action: "cancel" }, () => true)),
    { reason: "invalid_input" },
  );
  await assert.rejects(
    run(f.store.stageCorrectionSave(session, { ...attempt, actorId: id(2) }, () => true)),
    { reason: "storage" },
  );
  assert.equal(await run(f.store.readCorrectionSave(session)), null);
  await run(f.store.stageCorrectionSave(session, attempt, () => true));
  const changed = {
    ...attempt,
    command: {
      ...attempt.command,
      correction: { ...attempt.command.correction, sourceEventId: id(401) },
    },
  };
  await assert.rejects(run(f.store.stageCorrectionSave(session, changed, () => true)), {
    reason: "pending_edit",
  });
  f.connection.prepare("UPDATE correction_save_attempts SET data=?").run('{"command":false}');
  await assert.rejects(run(f.store.readCorrectionSave(session)), { reason: "storage" });
  const otherHome = await run(f.store.activate({ ...account, household: id(11) }, lease));
  assert.equal(await run(f.store.readCorrectionSave(otherHome)), null);
});
