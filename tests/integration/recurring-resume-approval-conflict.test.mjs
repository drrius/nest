import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, id, run } from "./recurring-resume-approval-fixture.mjs";
import { recurringStateApprovalOperations } from "../../apps/mobile/src/money/recurring-state-approval-operations.ts";
import { RecurringStateApprovalRuntime } from "../../apps/mobile/src/money/recurring-state-approval-runtime.ts";
import {
  recurringStateApprovalActions,
  recurringStateApprovalText,
} from "../../apps/mobile/src/money/recurring-state-approval-display.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
function operations(f, local, session) {
  const client = Object.fromEntries(
    Object.entries(f.client()).map(([key, method]) => [
      key,
      (...args) => method(...args).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    ]),
  );
  return recurringStateApprovalOperations({ store: local.store, session }, client, "resume");
}
for (const conflict of ["date", "revision"]) {
  test(`staged resume ${conflict} conflict requires authoritative reread before retiring intent and explicit denial`, async (t) => {
    const { f, local, session, approvalId } = await fixture(
      t,
      conflict === "date" ? { resumeFrom: "2000-01-01" } : {},
    );
    const ops = operations(f, local, session);
    const approval = await run(ops.read(approvalId));
    await run(
      ops.stage({ approvalId, operationId: approval.operationId, approved: true }, () => true),
    );
    if (conflict === "revision")
      await run(
        f.client(f.url, 2, f.partnerBearer).saveRecurring({
          operationId: id(701),
          rule: {
            ...f.rule,
            expectedRevision: approval.change.expectedRevision,
            configuration: { ...f.rule.configuration, note: "Partner revised" },
          },
        }),
      );
    let reads = 0,
      sends = 0,
      failRead = true;
    const runtime = new RecurringStateApprovalRuntime(
      {
        ...ops,
        read: (target) => {
          reads++;
          return failRead && reads === 2
            ? Effect.fail(new Error("Authoritative reread unavailable"))
            : ops.read(target);
        },
        decide: (input) => {
          sends++;
          return ops.decide(input);
        },
      },
      approvalId,
    );
    t.after(() => runtime.dispose());
    await runtime.setOnline(true);
    await runtime.setActive(true);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.ok(await run(local.store.readRecurringStateApproval(session, approvalId)));
    assert.equal(sends, 0);
    failRead = false;
    reads = 0;
    await runtime.refresh();
    assert.equal(runtime.getSnapshot().attempt, null);
    assert.equal(await run(local.store.readRecurringStateApproval(session, approvalId)), null);
    const actions = recurringStateApprovalActions(runtime.getSnapshot(), Date.now());
    assert.equal(actions.confirm, false);
    assert.equal(actions.deny, true);
    await runtime.decide(runtime.getSnapshot().approval, true);
    assert.equal(sends, 0);
    await runtime.decide(runtime.getSnapshot().approval, false);
    assert.equal(sends, 1);
    assert.equal(runtime.getSnapshot().approval.status, "denied");
    assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "paused");
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  });
}
test("resume review binds exact financial authority and first uncovered cycle; stale alert cannot approve", async (t) => {
  const { f, local, session, approvalId } = await fixture(t),
    ops = operations(f, local, session);
  const runtime = new RecurringStateApprovalRuntime(ops, approvalId);
  t.after(() => runtime.dispose());
  await runtime.setOnline(true);
  await runtime.setActive(true);
  const view = runtime.getSnapshot(),
    text = recurringStateApprovalText(view.approval, view.context, id(1));
  assert.match(text, /Authorize future automatic expense recording/);
  assert.match(text, /Your share: CHF/);
  assert.match(text, /Other member’s share: CHF/);
  assert.match(text, new RegExp(f.rule.ruleId));
  assert.match(text, /Skipped paused cycles will not be backfilled/);
  const wrongCycle = {
    ...view,
    approval: { ...view.approval, change: { ...view.approval.change, firstDueOn: "2099-01-31" } },
  };
  assert.equal(recurringStateApprovalActions(wrongCycle, Date.now()).confirm, false);
  await runtime.refresh();
  await runtime.decide(view.approval, true);
  assert.equal((await run(ops.read(approvalId))).status, "pending");
  await runtime.setActive(false);
  await runtime.decide(runtime.getSnapshot().approval, true);
  assert.equal((await run(ops.read(approvalId))).status, "pending");
});
