import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, run, account } from "./offline-fixture.mjs";
import { manualSaveAttempt } from "../src/money/recurring-manual-save-attempt.ts";
import { id } from "../../../tests/api/recurring-transport-fixture.mjs";
const attempt = manualSaveAttempt({
  operationId: id(700),
  input: {
    ruleId: id(100),
    expectedRevision: id(400),
    dueOn: "2026-09-22",
    sourceEventId: id(600),
  },
});
test("manual recovery preserves exact source selection across restart and cannot replace or undo abandonment", async (t) => {
  const f = await fixture(t),
    session = f.session;
  await run(f.store.stageManualCycleSave(session, attempt, () => true));
  const reopened = f.reopen();
  assert.deepEqual(await run(reopened.store.readManualCycleSave(session)), attempt);
  const changed = {
    ...attempt,
    command: {
      ...attempt.command,
      input: {
        ...attempt.command.input,
        sourceEventId: id(601),
      },
    },
  };
  await assert.rejects(run(reopened.store.stageManualCycleSave(session, changed, () => true)), {
    reason: "pending_edit",
  });
  const cancelled = { ...attempt, action: "cancel" };
  await run(reopened.store.stageManualCycleSave(session, cancelled, () => true));
  await assert.rejects(run(reopened.store.stageManualCycleSave(session, attempt, () => true)), {
    reason: "pending_edit",
  });
  await assert.rejects(run(reopened.store.clearManualCycleSave(session, attempt)), {
    reason: "operation_reused",
  });
  const partner = await run(reopened.store.activate({ ...account, actor: id(2) }, id(901)));
  assert.equal(await run(reopened.store.readManualCycleSave(partner)), null);
  await assert.rejects(run(reopened.store.readManualCycleSave(session)), {
    reason: "session_changed",
  });
  const restored = await run(reopened.store.activate(account, id(902)));
  assert.deepEqual(await run(reopened.store.readManualCycleSave(restored)), cancelled);
});
test("malformed source, corrupt storage and stale staging cannot authorize manual Save", async (t) => {
  const f = await fixture(t),
    session = f.session;
  await assert.rejects(run(f.store.stageManualCycleSave(session, attempt, () => false)), {
    reason: "cancelled",
  });
  const invalid = {
    ...attempt,
    command: { ...attempt.command, input: { ...attempt.command.input, sourceEventId: "invalid" } },
  };
  await assert.rejects(run(f.store.stageManualCycleSave(session, invalid, () => true)), {
    reason: "storage",
  });
  assert.equal(await run(f.store.readManualCycleSave(session)), null);
  await run(f.store.stageManualCycleSave(session, attempt, () => true));
  f.connection.prepare("update manual_cycle_save_attempts set data=?").run('{"command":false}');
  await assert.rejects(run(f.store.readManualCycleSave(session)), { reason: "storage" });
  const other = await run(f.store.activate({ ...account, household: id(11) }, id(901)));
  assert.equal(await run(f.store.readManualCycleSave(other)), null);
});
