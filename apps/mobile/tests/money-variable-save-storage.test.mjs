import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, run, account } from "./offline-fixture.mjs";
import { variableSaveAttempt } from "../src/money/recurring-variable-save-attempt.ts";
import { id } from "../../../tests/api/recurring-transport-fixture.mjs";
const attempt = variableSaveAttempt({
  operationId: id(700),
  input: {
    ruleId: id(100),
    expectedRevision: id(400),
    dueOn: "2026-09-22",
    amountCentimes: "101",
    allocations: [
      { memberId: account.actor, centimes: "51" },
      { memberId: id(2), centimes: "50" },
    ],
  },
});
test("variable recovery preserves exact amounts/splits across restart and cannot replace or undo abandonment", async (t) => {
  const f = await fixture(t),
    session = f.session;
  await run(f.store.stageVariableCycleSave(session, attempt, () => true));
  const reopened = f.reopen();
  assert.deepEqual(await run(reopened.store.readVariableCycleSave(session)), attempt);
  const changed = {
    ...attempt,
    command: {
      ...attempt.command,
      input: {
        ...attempt.command.input,
        allocations: [
          { memberId: account.actor, centimes: "50" },
          { memberId: id(2), centimes: "51" },
        ],
      },
    },
  };
  await assert.rejects(run(reopened.store.stageVariableCycleSave(session, changed, () => true)), {
    reason: "pending_edit",
  });
  const cancelled = { ...attempt, action: "cancel" };
  await run(reopened.store.stageVariableCycleSave(session, cancelled, () => true));
  await assert.rejects(run(reopened.store.stageVariableCycleSave(session, attempt, () => true)), {
    reason: "pending_edit",
  });
  await assert.rejects(run(reopened.store.clearVariableCycleSave(session, attempt)), {
    reason: "operation_reused",
  });
  const partner = await run(reopened.store.activate({ ...account, actor: id(2) }, id(901)));
  assert.equal(await run(reopened.store.readVariableCycleSave(partner)), null);
  await assert.rejects(run(reopened.store.readVariableCycleSave(session)), {
    reason: "session_changed",
  });
  const restored = await run(reopened.store.activate(account, id(902)));
  assert.deepEqual(await run(reopened.store.readVariableCycleSave(restored)), cancelled);
});
test("malformed allocation, corrupt storage and stale staging cannot authorize variable Save", async (t) => {
  const f = await fixture(t),
    session = f.session;
  await assert.rejects(run(f.store.stageVariableCycleSave(session, attempt, () => false)), {
    reason: "cancelled",
  });
  const invalid = {
    ...attempt,
    command: { ...attempt.command, input: { ...attempt.command.input, amountCentimes: "102" } },
  };
  await assert.rejects(run(f.store.stageVariableCycleSave(session, invalid, () => true)), {
    reason: "storage",
  });
  assert.equal(await run(f.store.readVariableCycleSave(session)), null);
  await run(f.store.stageVariableCycleSave(session, attempt, () => true));
  f.connection.prepare("update variable_cycle_save_attempts set data=?").run('{"command":false}');
  await assert.rejects(run(f.store.readVariableCycleSave(session)), { reason: "storage" });
  const other = await run(f.store.activate({ ...account, household: id(11) }, id(901)));
  assert.equal(await run(f.store.readVariableCycleSave(other)), null);
});
