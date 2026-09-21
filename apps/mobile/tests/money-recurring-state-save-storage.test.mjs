import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, run, account, lease } from "./offline-fixture.mjs";
import { attempt, id } from "./money-recurring-state-save-fixture.mjs";
test("direct Save recovery keeps one exact command per account across restart and opposing decisions", async (t) => {
  const f = await fixture(t),
    session = f.session;
  const changed = { ...attempt, command: { ...attempt.command, operationId: id(200) } };
  const outcomes = await Promise.allSettled([
    run(f.store.stageRecurringStateSave(session, attempt, () => true)),
    run(f.store.stageRecurringStateSave(session, changed, () => true)),
  ]);
  assert.equal(outcomes.filter((value) => value.status === "fulfilled").length, 1);
  const saved = await run(f.store.readRecurringStateSave(session));
  const reopened = f.reopen();
  assert.deepEqual(await run(reopened.store.readRecurringStateSave(session)), saved);
  const cancelled = { ...saved, action: "cancel" };
  await run(reopened.store.stageRecurringStateSave(session, cancelled, () => true));
  await assert.rejects(run(reopened.store.stageRecurringStateSave(session, saved, () => true)), {
    reason: "pending_edit",
  });
  await assert.rejects(run(reopened.store.clearRecurringStateSave(session, saved)), {
    reason: "operation_reused",
  });
  const partner = await run(reopened.store.activate({ ...account, actor: id(2) }, id(3)));
  assert.equal(await run(reopened.store.readRecurringStateSave(partner)), null);
  await assert.rejects(run(reopened.store.readRecurringStateSave(session)), {
    reason: "session_changed",
  });
  const original = await run(reopened.store.activate(account, id(4)));
  assert.deepEqual(await run(reopened.store.readRecurringStateSave(original)), cancelled);
  await run(reopened.store.clearRecurringStateSave(original, cancelled));
  assert.equal(await run(reopened.store.readRecurringStateSave(original)), null);
});
test("invalid, stale and corrupt Save recovery never authorizes a substitute command", async (t) => {
  const f = await fixture(t),
    session = f.session;
  await assert.rejects(run(f.store.stageRecurringStateSave(session, attempt, () => false)), {
    reason: "cancelled",
  });
  await assert.rejects(
    run(f.store.stageRecurringStateSave(session, { ...attempt, action: "cancel" }, () => true)),
    { reason: "invalid_input" },
  );
  await assert.rejects(
    run(f.store.stageRecurringStateSave(session, { ...attempt, actorId: id(2) }, () => true)),
    { reason: "storage" },
  );
  assert.equal(await run(f.store.readRecurringStateSave(session)), null);
  await run(f.store.stageRecurringStateSave(session, attempt, () => true));
  const changed = {
    ...attempt,
    command: {
      ...attempt.command,
      change: { ...attempt.command.change, expectedRevision: id(402) },
    },
  };
  await assert.rejects(run(f.store.stageRecurringStateSave(session, changed, () => true)), {
    reason: "pending_edit",
  });
  f.connection.prepare("UPDATE recurring_state_save_attempts SET data=?").run('{"command":false}');
  await assert.rejects(run(f.store.readRecurringStateSave(session)), { reason: "storage" });
  const otherHome = await run(f.store.activate({ ...account, household: id(11) }, lease));
  assert.equal(await run(f.store.readRecurringStateSave(otherHome)), null);
});
test("resume and stop share one pending intent; restart preserves exact dates and monotonic abandonment", async (t) => {
  const f = await fixture(t),
    session = f.session;
  const resume = {
    action: "save",
    command: {
      operationId: id(700),
      change: {
        ruleId: id(100),
        expectedRevision: id(400),
        expectedStatus: "paused",
        action: "resume",
        resumeFrom: "2099-01-01",
        firstDueOn: "2099-01-31",
      },
    },
  };
  await run(f.store.stageRecurringStateSave(session, resume, () => true));
  const reopened = f.reopen();
  assert.deepEqual(await run(reopened.store.readRecurringStateSave(session)), resume);
  for (const incompatible of [
    attempt,
    {
      ...resume,
      command: {
        ...resume.command,
        change: {
          ...resume.command.change,
          resumeFrom: "2099-01-02",
        },
      },
    },
  ]) {
    await assert.rejects(
      run(reopened.store.stageRecurringStateSave(session, incompatible, () => true)),
      { reason: "pending_edit" },
    );
  }
  const cancelled = { ...resume, action: "cancel" };
  await run(reopened.store.stageRecurringStateSave(session, cancelled, () => true));
  await assert.rejects(run(reopened.store.stageRecurringStateSave(session, resume, () => true)), {
    reason: "pending_edit",
  });
  await assert.rejects(run(reopened.store.clearRecurringStateSave(session, resume)), {
    reason: "operation_reused",
  });
  await run(reopened.store.clearRecurringStateSave(session, cancelled));
  await run(reopened.store.stageRecurringStateSave(session, attempt, () => true));
  assert.deepEqual(await run(reopened.store.readRecurringStateSave(session)), attempt);
});
