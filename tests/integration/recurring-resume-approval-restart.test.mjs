import { recurringStateApprovalActions } from "../../apps/mobile/src/money/recurring-state-approval-display.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { recurringStateApprovalOperations } from "../../apps/mobile/src/money/recurring-state-approval-operations.ts";
import { RecurringStateApprovalRuntime } from "../../apps/mobile/src/money/recurring-state-approval-runtime.ts";
import { fixture, id, run } from "./recurring-resume-approval-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
for (const approved of [true, false]) {
  test(`recurring resume decision ${approved} survives SQLite restart and recovers a single committed decision`, async (t) => {
    const { f, local, account, session, approvalId } = await fixture(t);
    const proxy = await lostResponseProxy(t, f.url, "/v1/money/recurring/resume/approval/decide");
    const raw = moneyClient(
      proxy.url,
      account,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    let sends = 0;
    const client = Object.fromEntries(
      [
        "recurringResumeApproval",
        "recurringRules",
        "recurringRule",
        "balance",
        "decideRecurringResume",
      ].map((name) => [
        name,
        (...args) => {
          if (name === "decideRecurringResume") sends++;
          return raw[name](...args).pipe(Effect.provideService(Fetch.Fetch, fetch));
        },
      ]),
    );
    const runtime = new RecurringStateApprovalRuntime(
      recurringStateApprovalOperations({ store: local.store, session }, client, "resume"),
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
    const recovered = new RecurringStateApprovalRuntime(
      recurringStateApprovalOperations({ store: reopened.store, session }, client, "resume"),
      approvalId,
    );
    await recovered.setOnline(true);
    await recovered.setActive(true);
    assert.equal(recovered.getSnapshot().approval.status, approved ? "consumed" : "denied");
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(sends, 1);
    assert.equal(await run(reopened.store.readRecurringStateApproval(session, approvalId)), null);
    assert.equal(
      f.db.sql("select count(*) from public.nest_recurring_revisions"),
      approved ? "3" : "2",
    );
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
    await recovered.setActive(false);
    assert.equal(recovered.getSnapshot().approval, null);
    recovered.dispose();
  });
}

function checkActions(view) {
  assert.equal(recurringStateApprovalActions(view, Date.now()).confirm, true);
  assert.equal(
    recurringStateApprovalActions(view, Date.parse(view.approval.expiresAt)).confirm,
    false,
  );
  for (const patch of [
    { active: false },
    { online: false },
    { fresh: false },
    { busy: true },
    { verify: true },
  ]) {
    const actions = recurringStateApprovalActions({ ...view, ...patch }, Date.now());
    assert.equal(actions.confirm, false);
    assert.equal(actions.deny, false);
  }
  const stale = { ...view, context: { ...view.context, revision: id(999) } };
  assert.equal(recurringStateApprovalActions(stale, Date.now()).confirm, false);
  assert.equal(recurringStateApprovalActions(stale, Date.now()).deny, true);
}
