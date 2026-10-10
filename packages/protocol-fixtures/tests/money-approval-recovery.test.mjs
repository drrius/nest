import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fixture,
  pending,
  intent,
  consumed,
  Effect,
  run,
  id,
  account,
} from "./money-approval-fixture.mjs";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { ExpenseApprovalRuntime } from "../src/money/approval-runtime.ts";
import { expenseApprovalOperations } from "../src/money/approval-operations.ts";
const unavailable = () => Effect.fail(new PreferenceFailure({ code: "unavailable" }));
test("expense recovery persists before dispatch and reopens committed outcome without another write", async (t) => {
  const f = await fixture(t),
    runtime = f.runtime();
  await runtime.setActive(true);
  f.behavior(() =>
    Effect.gen(function* () {
      assert.deepEqual(yield* f.db.store.readExpenseApproval(f.db.session, pending.id), intent);
      f.current(consumed());
      return yield* unavailable();
    }),
  );
  await runtime.decide(runtime.getSnapshot().approval, true);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.equal(f.calls(), 1);
  runtime.dispose();
  const reopened = f.db.reopen();
  const next = new ExpenseApprovalRuntime(
    expenseApprovalOperations({ store: reopened.store, session: f.db.session }, f.client),
    pending.id,
  );
  await next.setActive(true);
  assert.equal(next.getSnapshot().approval.status, "consumed");
  assert.equal(next.getSnapshot().attempt, null);
  assert.equal(f.calls(), 1);
  assert.equal(await run(reopened.store.readExpenseApproval(f.db.session, pending.id)), null);
  next.dispose();
});
test("unresolved decision survives reload and only explicit exact retry can send", async (t) => {
  const f = await fixture(t),
    runtime = f.runtime();
  await runtime.setActive(true);
  f.behavior(unavailable);
  await runtime.decide(runtime.getSnapshot().approval, false);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().attempt.approved, false);
  await runtime.decide(runtime.getSnapshot().approval, true);
  assert.equal(f.calls(), 1);
  f.behavior((input) => {
    assert.equal(input.approved, false);
    return Effect.succeed({ ...pending, status: "denied" });
  });
  await runtime.retry();
  assert.equal(f.calls(), 2);
  assert.equal(runtime.getSnapshot().approval.status, "denied");
  assert.equal(await run(f.db.store.readExpenseApproval(f.db.session, pending.id)), null);
  runtime.dispose();
});
test("stale alert and expired initial decision cannot dispatch; saved exact retry remains recoverable", async (t) => {
  const f = await fixture(t),
    runtime = f.runtime();
  await runtime.setActive(true);
  const old = runtime.getSnapshot().approval;
  await runtime.refresh();
  await runtime.decide(old, true);
  assert.equal(f.calls(), 0);
  f.now(Date.parse(pending.expiresAt));
  await runtime.decide(runtime.getSnapshot().approval, true);
  assert.equal(f.calls(), 0);
  await run(f.db.store.stageExpenseApproval(f.db.session, intent, () => true));
  await runtime.refresh();
  await runtime.retry();
  assert.equal(f.calls(), 1);
  runtime.dispose();
});
test("conflicting persisted decision and storage failure stop before any financial dispatch", async (t) => {
  const f = await fixture(t),
    runtime = f.runtime();
  await runtime.setActive(true);
  await run(
    f.db.store.stageExpenseApproval(f.db.session, { ...intent, approved: false }, () => true),
  );
  await runtime.decide(runtime.getSnapshot().approval, true);
  assert.equal(f.calls(), 0);
  assert.equal(runtime.getSnapshot().fresh, false);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().attempt.approved, false);
  runtime.dispose();
  const broken = new ExpenseApprovalRuntime(
    { ...f.operations, stage: () => unavailable() },
    pending.id,
    () => 1,
  );
  await run(f.db.store.clearExpenseApproval(f.db.session, { ...intent, approved: false }));
  await broken.setActive(true);
  await broken.decide(broken.getSnapshot().approval, true);
  assert.equal(f.calls(), 0);
  broken.dispose();
});
test("account denial hides private approval and stops automatic reloading", async (t) => {
  const f = await fixture(t),
    runtime = f.runtime();
  await runtime.setActive(true);
  await run(f.db.store.activate({ ...account, actor: id(5) }, id(6)));
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().approval, null);
  assert.equal(runtime.getSnapshot().verify, true);
  await runtime.setActive(false);
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().approval, null);
  assert.equal(f.calls(), 0);
  runtime.dispose();
});
test("background cancellation retains staged decision and reconciles late commit without another write", async (t) => {
  const f = await fixture(t),
    runtime = f.runtime();
  let release, started;
  const startedPromise = new Promise((resolve) => {
    started = resolve;
  });
  f.behavior(() =>
    Effect.tryPromise({
      try: () =>
        new Promise((resolve) => {
          release = resolve;
          started();
        }),
      catch: () => new PreferenceFailure({ code: "unavailable" }),
    }),
  );
  await runtime.setActive(true);
  const sending = runtime.decide(runtime.getSnapshot().approval, true);
  await startedPromise;
  await runtime.setActive(false);
  f.current(consumed());
  release(consumed());
  await sending;
  assert.equal(runtime.getSnapshot().approval, null);
  assert.deepEqual(await run(f.db.store.readExpenseApproval(f.db.session, pending.id)), intent);
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().approval.status, "consumed");
  assert.equal(f.calls(), 1);
  runtime.dispose();
});
test("confirmed server result survives local cleanup failure and is recovered without reposting", async (t) => {
  const f = await fixture(t);
  let cleanup = false;
  const runtime = new ExpenseApprovalRuntime(
    {
      ...f.operations,
      clear: (attempt) => (cleanup ? f.operations.clear(attempt) : unavailable()),
    },
    pending.id,
    () => 1,
  );
  await runtime.setActive(true);
  await runtime.decide(runtime.getSnapshot().approval, true);
  assert.equal(runtime.getSnapshot().approval.status, "consumed");
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.deepEqual(runtime.getSnapshot().attempt, intent);
  cleanup = true;
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().approval.status, "consumed");
  assert.equal(runtime.getSnapshot().attempt, null);
  assert.equal(f.calls(), 1);
  runtime.dispose();
});
test("saved operation mismatch prevents recovery from substituting another approval command", async (t) => {
  const f = await fixture(t);
  await run(
    f.db.store.stageExpenseApproval(f.db.session, { ...intent, operationId: id(999) }, () => true),
  );
  const runtime = f.runtime();
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().approval, null);
  assert.equal(runtime.getSnapshot().fresh, false);
  await runtime.retry();
  assert.equal(f.calls(), 0);
  runtime.dispose();
});
