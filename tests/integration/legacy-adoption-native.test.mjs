import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run } from "./legacy-adoption-native-fixture.mjs";
test("native adoption stages before dispatch and recovers a lost committed response after SQLite restart without resending", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("after");
  await runtime.save(f.command);
  assert.equal(runtime.getSnapshot().attempt.command.operationId, f.command.operationId);
  assert.equal(
    (await run(f.local.store.readLegacyAdoptionSave(f.session))).command.input.reviewToken,
    f.context.reviewToken,
  );
  assert.equal(f.sends(), 1);
  runtime.dispose();
  await f.local.idle();
  const reopened = f.local.reopen(),
    resumed = await f.mount(reopened.store);
  assert.equal(resumed.getSnapshot().result.status, "recorded");
  assert.deepEqual(resumed.getSnapshot().result.receipt.reviewed, f.context);
  assert.equal(resumed.getSnapshot().attempt, null);
  assert.equal(f.sends(), 1);
  assert.equal(await run(reopened.store.readLegacyAdoptionSave(f.session)), null);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_adoption_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "1");
});
test("restart checks an unresolved adoption without replaying it, blocks replacement and persists explicit abandonment", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("before");
  await runtime.save(f.command);
  runtime.dispose();
  await f.local.idle();
  const reopened = f.local.reopen(),
    resumed = await f.mount(reopened.store);
  assert.equal(resumed.getSnapshot().result.status, "unresolved");
  assert.equal(f.sends(), 1);
  await resumed.save({ ...f.command, operationId: id(701) });
  assert.equal(f.sends(), 1);
  await resumed.abandon(resumed.getSnapshot().attempt);
  assert.equal(resumed.getSnapshot().result.status, "cancelled");
  assert.equal(await run(reopened.store.readLegacyAdoptionSave(f.session)), null);
  f.fault("none");
  await assert.rejects(run(f.client.saveLegacyAdoption(f.command)));
  assert.equal(f.db.sql("select active from public.recurring_expense_rules"), "t");
});
test("account replacement hides unresolved intent and prevents its use by the other member", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("before");
  await runtime.save(f.command);
  const partner = await run(f.local.store.activate({ actor: id(2), household: id(10) }, id(951)));
  assert.equal(await run(f.local.store.readLegacyAdoptionSave(partner)), null);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(runtime.getSnapshot().attempt, null);
  await runtime.retry();
  assert.equal(f.sends(), 1);
  assert.equal(f.db.sql("select active from public.recurring_expense_rules"), "t");
});

test("SQLite staging failure sends nothing and a cleanup failure preserves the confirmed mandate for recovery", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.local.connection.exec(
    "CREATE TRIGGER block_stage BEFORE INSERT ON legacy_adoption_save_attempts BEGIN SELECT RAISE(ABORT,'staging failure'); END",
  );
  await runtime.save(f.command);
  assert.equal(f.sends(), 0);
  assert.equal(f.db.sql("select active from public.recurring_expense_rules"), "t");
  f.local.connection.exec("DROP TRIGGER block_stage");
  f.local.connection.exec(
    "CREATE TRIGGER block_cleanup BEFORE DELETE ON legacy_adoption_save_attempts BEGIN SELECT RAISE(ABORT,'cleanup failure'); END",
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
  assert.equal(await run(f.local.store.readLegacyAdoptionSave(f.session)), null);
});
