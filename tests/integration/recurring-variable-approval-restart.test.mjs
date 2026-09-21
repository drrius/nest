import { variableCycleApprovalActions } from "../../apps/mobile/src/money/recurring-variable-approval-display.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { variableCycleApprovalOperations } from "../../apps/mobile/src/money/recurring-variable-approval-operations.ts";
import { VariableCycleApprovalRuntime } from "../../apps/mobile/src/money/recurring-variable-approval-runtime.ts";
import { fixture, id, run } from "./recurring-variable-approval-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
for (const approved of [true, false]) {
  test(`variable cycle decision ${approved} survives SQLite restart and recovers a single committed decision`, async (t) => {
    const { f, local, account, session, approvalId } = await fixture(t);
    const proxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/variable/approval/decide");
    const raw = moneyClient(
      proxy.url,
      account,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    let sends = 0;
    const client = Object.fromEntries(
      [
        "variableCycleApproval",
        "recurringRules",
        "recurringRule",
        "balance",
        "decideVariableCycle",
      ].map((name) => [
        name,
        (...args) => {
          if (name === "decideVariableCycle") sends++;
          return raw[name](...args).pipe(Effect.provideService(Fetch.Fetch, fetch));
        },
      ]),
    );
    const runtime = new VariableCycleApprovalRuntime(
      variableCycleApprovalOperations({ store: local.store, session }, client),
      approvalId,
    );
    await runtime.setOnline(true);
    await runtime.setActive(true);
    const stale = runtime.getSnapshot().approval;
    checkActions(runtime.getSnapshot());
    await runtime.refresh();
    await runtime.decide(stale, approved);
    assert.equal(sends, 0);
    await runtime.decide(runtime.getSnapshot().approval, approved);
    assert.equal(sends, 1);
    assert.equal(proxy.dropped(), 1);
    const attempt = await run(local.store.readRecurringStateApproval(session, approvalId));
    assert.deepEqual(attempt, { approvalId, operationId: id(700), approved });
    await assert.rejects(
      run(
        local.store.stageRecurringStateApproval(
          session,
          { ...attempt, approved: !approved },
          () => true,
        ),
      ),
    );
    assert.equal(runtime.getSnapshot().fresh, false);
    runtime.dispose();
    const reopened = local.reopen();
    const recovered = new VariableCycleApprovalRuntime(
      variableCycleApprovalOperations({ store: reopened.store, session }, client),
      approvalId,
    );
    await recovered.setOnline(true);
    await recovered.setActive(true);
    assert.equal(recovered.getSnapshot().approval.status, approved ? "consumed" : "denied");
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(sends, 1);
    assert.equal(await run(reopened.store.readRecurringStateApproval(session, approvalId)), null);
    assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
    assert.equal(f.db.sql("select count(*) from public.financial_events"), approved ? "1" : "0");
    await recovered.setActive(false);
    assert.equal(recovered.getSnapshot().approval, null);
    recovered.dispose();
  });
}

function checkActions(view) {
  assert.equal(variableCycleApprovalActions(view, Date.now()).confirm, true);
  assert.equal(
    variableCycleApprovalActions(view, Date.parse(view.approval.expiresAt)).confirm,
    false,
  );
  for (const patch of [
    { active: false },
    { online: false },
    { fresh: false },
    { busy: true },
    { verify: true },
  ]) {
    const actions = variableCycleApprovalActions({ ...view, ...patch }, Date.now());
    assert.equal(actions.confirm, false);
    assert.equal(actions.deny, false);
  }
  const stale = {
    ...view,
    context: { ...view.context, rule: { ...view.context.rule, revision: id(999) } },
  };
  assert.equal(variableCycleApprovalActions(stale, Date.now()).confirm, false);
  assert.equal(variableCycleApprovalActions(stale, Date.now()).deny, true);
}
