import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, id, run } from "./recurring-variable-approval-fixture.mjs";
import { variableCycleApprovalOperations } from "../../apps/mobile/src/money/recurring-variable-approval-operations.ts";
import { VariableCycleApprovalRuntime } from "../../apps/mobile/src/money/recurring-variable-approval-runtime.ts";
import {
  variableCycleApprovalText,
  variableCycleApprovalActions,
} from "../../apps/mobile/src/money/recurring-variable-approval-display.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const { PreferenceFailure } = await import("../../apps/mobile/src/preferences/client.ts");
test("consumed cycle retires stale approved intent only after a successful authoritative reread", async (t) => {
  const { f, local, session, approvalId } = await fixture(t);
  const raw = f.client();
  const client = Object.fromEntries(
    Object.entries(raw).map(([name, method]) => [
      name,
      (...args) => method(...args).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    ]),
  );
  const operations = variableCycleApprovalOperations({ store: local.store, session }, client);
  let reads = 0,
    fail = true;
  const runtime = new VariableCycleApprovalRuntime(
    {
      ...operations,
      read: (id) => {
        reads++;
        return fail && reads === 2
          ? Effect.fail(new PreferenceFailure({ code: "unavailable" }))
          : operations.read(id);
      },
    },
    approvalId,
  );
  t.after(() => runtime.dispose());
  await run(
    local.store.stageRecurringStateApproval(
      session,
      { approvalId, operationId: id(700), approved: true },
      () => true,
    ),
  );
  await run(raw.saveVariableCycle({ ...f.command, operationId: id(701) }));
  await runtime.setOnline(true);
  await runtime.setActive(true);
  assert.equal(reads, 2);
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.notEqual(await run(local.store.readRecurringStateApproval(session, approvalId)), null);
  fail = false;
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().attempt, null);
  assert.equal(runtime.getSnapshot().approval.status, "pending");
  const actions = variableCycleApprovalActions(runtime.getSnapshot(), Date.now());
  assert.equal(actions.confirm, false);
  assert.equal(actions.deny, true);
  await runtime.decide(runtime.getSnapshot().approval, false);
  assert.equal(runtime.getSnapshot().approval.status, "denied");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("variable approval review exposes exact retained payer, split, note, category and rule reference", async (t) => {
  const { f, approvalId } = await fixture(t);
  const approval = await run(f.client().variableCycleApproval(approvalId));
  const current = await run(f.client().recurringRule(f.rule.ruleId));
  const text = variableCycleApprovalText(approval, current, id(1));
  for (const value of [
    f.rule.ruleId,
    "CHF 1.01",
    "CHF 0.51",
    "CHF 0.50",
    "Payer: You",
    "Category:",
    "Note:",
    "without changing the mandate",
  ])
    assert.ok(text.includes(value), value);
  const changed = {
    ...current,
    rule: {
      ...current.rule,
      revision: id(999),
      configuration: { ...current.rule.configuration, description: "Unreviewed partner edit" },
    },
  };
  assert.ok(
    !variableCycleApprovalText(approval, changed, id(1)).includes("Unreviewed partner edit"),
  );
});
