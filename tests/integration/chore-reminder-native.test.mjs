import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run } from "./chore-reminder-native-fixture.mjs";
test("reminder save survives SQLite restart and recovers the committed result without resending", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("after");
  await runtime.save(f.command);
  assert.deepEqual((await run(f.local.store.readChoreReminderSave(f.session))).command, f.command);
  assert.equal(f.sends(), 1);
  runtime.dispose();
  await f.local.idle();
  const reopened = f.local.reopen(),
    resumed = await f.mount(reopened.store);
  assert.equal(resumed.getSnapshot().result.status, "recorded");
  assert.deepEqual(resumed.getSnapshot().result.receipt.command, f.command);
  assert.equal(await run(reopened.store.readChoreReminderSave(f.session)), null);
  assert.equal(f.sends(), 1);
  assert.equal(f.db.sql("select count(*) from public.routine_completions"), "0");
});
test("unresolved reminder changes require explicit retry or durable cancellation", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("before");
  await runtime.save(f.command);
  runtime.dispose();
  await f.local.idle();
  const reopened = f.local.reopen(),
    resumed = await f.mount(reopened.store);
  assert.equal(resumed.getSnapshot().result.status, "unresolved");
  await resumed.save({ ...f.command, operationId: id(999) });
  assert.equal(f.sends(), 1);
  await resumed.abandon(resumed.getSnapshot().attempt);
  assert.equal(resumed.getSnapshot().result.status, "cancelled");
  assert.equal(await run(reopened.store.readChoreReminderSave(f.session)), null);
  f.fault("none");
  await assert.rejects(run(f.client.save(f.command)));
  assert.equal(f.db.sql("select count(*) from public.nest_chore_reminders"), "0");
});
test("account replacement hides pending reminder intent and prevents sending it", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("before");
  await runtime.save(f.command);
  const partner = await run(f.local.store.activate({ actor: id(2), household: id(10) }, id(951)));
  assert.equal(await run(f.local.store.readChoreReminderSave(partner)), null);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(runtime.getSnapshot().attempt, null);
  await runtime.retry();
  assert.equal(f.sends(), 1);
});

test("SQLite staging failure sends nothing and a cleanup failure preserves the confirmed reminder for recovery", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.local.connection.exec(
    "CREATE TRIGGER block_stage BEFORE INSERT ON chore_reminder_save_attempts BEGIN SELECT RAISE(ABORT,'staging failure'); END",
  );
  await runtime.save(f.command);
  assert.equal(f.sends(), 0);
  assert.equal(f.db.sql("select count(*) from public.nest_chore_reminders"), "0");
  f.local.connection.exec("DROP TRIGGER block_stage");
  f.local.connection.exec(
    "CREATE TRIGGER block_cleanup BEFORE DELETE ON chore_reminder_save_attempts BEGIN SELECT RAISE(ABORT,'cleanup failure'); END",
  );
  await runtime.refresh();
  await runtime.save(f.command);
  assert.equal(runtime.getSnapshot().result.status, "recorded");
  assert.ok(runtime.getSnapshot().attempt);
  assert.match(runtime.getSnapshot().notice, /server confirmed/);
  assert.equal(f.sends(), 1);
  f.local.connection.exec("DROP TRIGGER block_cleanup");
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().result.status, "recorded");
  assert.equal(runtime.getSnapshot().attempt, null);
  assert.equal(f.sends(), 1);
  assert.equal(await run(f.local.store.readChoreReminderSave(f.session)), null);
});
test("a deleted chore cannot strand its unconfirmed reminder: retry conflicts and cancellation remains available", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("before");
  await runtime.save(f.command);
  f.db.sql(`delete from public.routine_occurrences where id='${f.occurrenceId}'`);
  await assert.rejects(run(f.native.detail(f.occurrenceId)), { code: "forbidden" });
  f.fault("none");
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().result.status, "unresolved");
  await runtime.retry();
  assert.equal(runtime.getSnapshot().verify, false);
  await runtime.refresh();
  await runtime.abandon(runtime.getSnapshot().attempt);
  assert.equal(runtime.getSnapshot().result.status, "cancelled");
  assert.equal(f.db.sql("select count(*) from public.nest_chore_reminders"), "0");
});
