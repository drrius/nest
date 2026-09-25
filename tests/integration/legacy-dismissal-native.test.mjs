import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run } from "./legacy-dismissal-native-fixture.mjs";
import { recurringReadOperations } from "../../apps/mobile/src/money/recurring-read-operations.ts";
import { RecurringReadRuntime } from "../../apps/mobile/src/money/recurring-read-runtime.ts";
import {
  dismissalContext,
  prepareDismissal,
  dismissalConfirmationCurrent,
  dismissalText,
} from "../../apps/mobile/src/money/legacy-dismissal-confirmation.ts";
test("native dismissal stages before dispatch and recovers a lost committed response after write suspension and SQLite restart without resending", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("after");
  await runtime.save(f.command);
  assert.equal(runtime.getSnapshot().attempt.command.operationId, f.command.operationId);
  assert.equal(
    (await run(f.local.store.readLegacyDismissalSave(f.session))).command.input.reviewToken,
    f.context.reviewToken,
  );
  assert.equal(f.sends(), 1);
  f.db.sql(`revoke execute on function public.nest_save_legacy_dismissal(uuid,uuid,jsonb),
    public.nest_cancel_legacy_dismissal(uuid,uuid) from public,anon,authenticated,service_role`);
  runtime.dispose();
  await f.local.idle();
  const reopened = f.local.reopen(),
    resumed = await f.mount(reopened.store);
  assert.equal(resumed.getSnapshot().result.status, "recorded");
  assert.deepEqual(resumed.getSnapshot().result.receipt.reviewed, f.context);
  assert.equal(resumed.getSnapshot().attempt, null);
  assert.equal(f.sends(), 1);
  assert.equal(await run(reopened.store.readLegacyDismissalSave(f.session)), null);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_draft_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("restart checks an unresolved dismissal without replaying it, blocks replacement and persists explicit abandonment", async (t) => {
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
  assert.equal(await run(reopened.store.readLegacyDismissalSave(f.session)), null);
  f.fault("none");
  await assert.rejects(run(f.client.saveLegacyDismissal(f.command)));
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});
test("native review captures the current context and stale alert callbacks are invalid after reload or background", async (t) => {
  const f = await fixture(t),
    save = await f.mount();
  const read = new RecurringReadRuntime(
    recurringReadOperations({ store: f.local.store, session: f.session }, f.client),
    { kind: "legacy-review", draftId: id(900) },
  );
  t.after(() => read.dispose());
  await read.setOnline(true);
  await read.setActive(true);
  const current = () => dismissalContext(read.getSnapshot(), save.getSnapshot());
  const expected = prepareDismissal(current(), id(700));
  assert.equal(dismissalConfirmationCurrent(expected, current()), true);
  assert.match(dismissalText(expected.context, id(1)), /Original draft.*Date:/s);
  assert.match(dismissalText(expected.context, id(1)), /No expense or payment/);
  await read.refresh();
  assert.equal(dismissalConfirmationCurrent(expected, current()), false);
  const refreshed = prepareDismissal(current(), id(701));
  await read.setActive(false);
  assert.equal(dismissalConfirmationCurrent(refreshed, current()), false);
  await read.setActive(true);
  await save.setOnline(false);
  assert.equal(current(), null);
  await save.save(f.command);
  assert.equal(f.sends(), 0);
});
test("account replacement hides unresolved intent and prevents its use by the other member", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.fault("before");
  await runtime.save(f.command);
  const partner = await run(f.local.store.activate({ actor: id(2), household: id(10) }, id(951)));
  assert.equal(await run(f.local.store.readLegacyDismissalSave(partner)), null);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(runtime.getSnapshot().attempt, null);
  await runtime.retry();
  assert.equal(f.sends(), 1);
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});

test("SQLite staging failure sends nothing and a cleanup failure preserves confirmed dismissal for recovery", async (t) => {
  const f = await fixture(t),
    runtime = await f.mount();
  f.local.connection.exec(
    "CREATE TRIGGER block_stage BEFORE INSERT ON legacy_dismissal_save_attempts BEGIN SELECT RAISE(ABORT,'staging failure'); END",
  );
  await runtime.save(f.command);
  assert.equal(f.sends(), 0);
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
  f.local.connection.exec("DROP TRIGGER block_stage");
  f.local.connection.exec(
    "CREATE TRIGGER block_cleanup BEFORE DELETE ON legacy_dismissal_save_attempts BEGIN SELECT RAISE(ABORT,'cleanup failure'); END",
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
  assert.equal(await run(f.local.store.readLegacyDismissalSave(f.session)), null);
});
