import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run } from "./legacy-confirmation-native-fixture.mjs";
test("native confirmation stages before dispatch and recovers a lost committed response after write suspension and SQLite restart without resending", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("after");
  await runtime.save(f.command);
  assert.equal(runtime.getSnapshot().attempt.command.operationId, f.command.operationId);
  assert.equal(
    (await run(f.local.store.readLegacyConfirmationSave(f.session))).command.input.reviewToken,
    f.context.reviewToken,
  );
  assert.equal(f.sends(), 1);
  f.db.sql(`revoke execute on function public.nest_save_legacy_confirmation(uuid,uuid,jsonb),
    public.nest_cancel_legacy_confirmation(uuid,uuid) from public,anon,authenticated,service_role`);
  runtime.dispose();
  await f.local.idle();
  const reopened = f.local.reopen(),
    resumed = await f.mount(reopened.store);
  assert.equal(resumed.getSnapshot().result.status, "recorded");
  assert.deepEqual(resumed.getSnapshot().result.receipt.reviewed, f.context);
  assert.equal(resumed.getSnapshot().attempt, null);
  assert.equal(f.sends(), 1);
  assert.equal(await run(reopened.store.readLegacyConfirmationSave(f.session)), null);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_confirmation_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(
    f.db.sql("select id from public.financial_events"),
    resumed.getSnapshot().result.receipt.eventId,
  );
});
test("restart checks an unresolved confirmation without replaying it, blocks replacement and persists explicit abandonment", async (t) => {
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
  assert.equal(await run(reopened.store.readLegacyConfirmationSave(f.session)), null);
  f.fault("none");
  await assert.rejects(run(f.client.saveLegacyConfirmation(f.command)));
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});
test("account replacement hides unresolved intent and prevents its use by the other member", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("before");
  await runtime.save(f.command);
  const partner = await run(f.local.store.activate({ actor: id(2), household: id(10) }, id(951)));
  assert.equal(await run(f.local.store.readLegacyConfirmationSave(partner)), null);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(runtime.getSnapshot().attempt, null);
  await runtime.retry();
  assert.equal(f.sends(), 1);
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});

test("SQLite staging failure sends nothing and a cleanup failure preserves the confirmed expense for recovery", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.local.connection.exec(
    "CREATE TRIGGER block_stage BEFORE INSERT ON legacy_confirmation_save_attempts BEGIN SELECT RAISE(ABORT,'staging failure'); END",
  );
  await runtime.save(f.command);
  assert.equal(f.sends(), 0);
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
  f.local.connection.exec("DROP TRIGGER block_stage");
  f.local.connection.exec(
    "CREATE TRIGGER block_cleanup BEFORE DELETE ON legacy_confirmation_save_attempts BEGIN SELECT RAISE(ABORT,'cleanup failure'); END",
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
  assert.equal(await run(f.local.store.readLegacyConfirmationSave(f.session)), null);
});
