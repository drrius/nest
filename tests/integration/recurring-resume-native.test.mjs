import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, run } from "./recurring-resume-native-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import {
  resumeConfirmationText,
  prepareRecurringResume,
} from "../../apps/mobile/src/money/recurring-resume-confirmation.ts";
for (const action of ["save", "cancel"]) {
  test(`native resume ${action} survives actual response loss and SQLite restart without resending`, async (t) => {
    const f = await fixture(t);
    const proxy = await lostResponseProxy(
      t,
      f.url,
      `/v1/money/recurring/resume/${action === "save" ? "save" : "cancel-save"}`,
    );
    const owner = f.owners(f.local.store, proxy.url);
    await f.start(owner);
    const expected = f.capture(owner);
    assert.match(
      resumeConfirmationText(expected, id(1)),
      /Authorize future automatic expense recording/,
    );
    assert.match(
      resumeConfirmationText(expected, id(1)),
      /Skipped paused cycles will not be backfilled/,
    );
    assert.match(resumeConfirmationText(expected, id(1)), new RegExp(expected.rule.ruleId));
    if (action === "save") await f.confirm(owner, expected);
    else {
      await run(
        f.local.store.stageRecurringStateSave(
          f.session,
          { action: "save", command: expected.command },
          () => true,
        ),
      );
      await owner.save.refresh();
      await owner.save.abandon(owner.save.getSnapshot().attempt);
    }
    assert.equal(proxy.dropped(), 1);
    assert.equal(owner.save.getSnapshot().fresh, false);
    assert.equal(f.sends(), 1);
    assert.deepEqual(await run(f.local.store.readRecurringStateSave(f.session)), {
      action,
      command: expected.command,
    });
    owner.read.dispose();
    owner.save.dispose();
    const reopened = f.local.reopen(),
      recovered = f.owners(reopened.store);
    await f.start(recovered);
    const result = recovered.save.getSnapshot().result;
    assert.equal(result.status, action === "save" ? "recorded" : "cancelled");
    assert.equal(f.sends(), 1);
    assert.equal(await run(reopened.store.readRecurringStateSave(f.session)), null);
    assert.equal(
      f.db.sql("select status from public.nest_recurring_rules"),
      action === "save" ? "active" : "paused",
    );
    assert.equal(
      f.db.sql("select count(*) from public.nest_recurring_revisions"),
      action === "save" ? "3" : "2",
    );
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
    assert.equal(
      reopened.connection.prepare("select count(*) as count from offline_operations").get().count,
      0,
    );
    if (action === "save") {
      assert.equal(result.receipt.status, "active");
      assert.deepEqual(result.receipt.change, expected.command.change);
      assert.deepEqual(result.receipt.configuration, expected.rule.configuration);
    } else await assert.rejects(run(f.client().saveRecurringResume(expected.command)));
  });
}
test("resumption rejects stale alerts and cannot replace a pending stop request", async (t) => {
  const f = await fixture(t),
    owner = f.owners();
  await f.start(owner);
  const old = f.capture(owner);
  await owner.read.refresh();
  await f.confirm(owner, old);
  assert.equal(f.sends(), 0);
  const background = f.capture(owner);
  await owner.save.setActive(false);
  await f.confirm(owner, background);
  assert.equal(f.sends(), 0);
  await owner.read.setActive(false);
  await owner.read.setActive(true);
  await owner.save.setActive(true);
  await f.confirm(owner, background);
  assert.equal(f.sends(), 0);
  const current = f.capture(owner);
  const stop = {
    action: "save",
    command: {
      operationId: id(800),
      change: {
        ruleId: current.rule.ruleId,
        expectedRevision: current.rule.revision,
        expectedStatus: "paused",
        action: "cancel",
      },
    },
  };
  await run(f.local.store.stageRecurringStateSave(f.session, stop, () => true));
  await f.confirm(owner, current);
  assert.equal(f.sends(), 0);
  assert.deepEqual(await run(f.local.store.readRecurringStateSave(f.session)), stop);
  await owner.save.refresh();
  await owner.save.abandon(owner.save.getSnapshot().attempt);
  owner.save.acknowledge();
  await owner.read.refresh();
  await f.confirm(owner, f.capture(owner));
  assert.equal(f.sends(), 1);
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "active");
  assert.equal(
    prepareRecurringResume(
      { ...current.rule, status: "cancelled" },
      current.change.resumeFrom,
      id(801),
    ),
    null,
  );
  const variable = {
    ...current,
    rule: {
      ...current.rule,
      configuration: {
        ...current.rule.configuration,
        mode: "variable",
        amountCentimes: null,
        allocations: null,
      },
    },
  };
  assert.match(
    resumeConfirmationText(variable, id(1)),
    /Each cycle still requires explicit amount and split confirmation/,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
