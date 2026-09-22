import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, id, run } from "./recurring-manual-approval-fixture.mjs";
import { manualCycleApprovalOperations } from "../../apps/mobile/src/money/recurring-manual-approval-operations.ts";
import { ManualCycleApprovalRuntime } from "../../apps/mobile/src/money/recurring-manual-approval-runtime.ts";
import {
  manualCycleApprovalText,
  manualCycleApprovalActions,
} from "../../apps/mobile/src/money/recurring-manual-approval-display.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
const { PreferenceFailure } = await import("../../apps/mobile/src/preferences/client.ts");
for (const conflict of ["cycle", "source"])
  test(`consumed ${conflict} retires stale approved intent only after a successful authoritative reread`, async (t) => {
    const { f, local, session, approvalId } = await fixture(t);
    const raw = f.client();
    const client = Object.fromEntries(
      Object.entries(raw).map(([name, method]) => [
        name,
        (...args) => method(...args).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      ]),
    );
    const operations = manualCycleApprovalOperations({ store: local.store, session }, client);
    let reads = 0,
      fail = true;
    const runtime = new ManualCycleApprovalRuntime(
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
    let command = { ...f.command, operationId: id(702) };
    if (conflict === "source") {
      const rule = { ...f.rule, ruleId: id(880) };
      const receipt = await run(raw.saveRecurring({ operationId: id(881), rule }));
      command = {
        ...command,
        input: { ...command.input, ruleId: rule.ruleId, expectedRevision: receipt.revision },
      };
    }
    await run(raw.saveManualCycle(command));
    await runtime.setOnline(true);
    await runtime.setActive(true);
    assert.equal(reads, 2);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.notEqual(await run(local.store.readRecurringStateApproval(session, approvalId)), null);
    fail = false;
    await runtime.refresh();
    assert.equal(runtime.getSnapshot().attempt, null);
    assert.equal(runtime.getSnapshot().approval.status, "pending");
    const actions = manualCycleApprovalActions(runtime.getSnapshot(), Date.now());
    assert.equal(actions.confirm, false);
    assert.equal(actions.deny, true);
    await runtime.decide(runtime.getSnapshot().approval, false);
    assert.equal(runtime.getSnapshot().approval.status, "denied");
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  });
test("manual approval review exposes exact retained payer, split, note, category and rule reference", async (t) => {
  const { f, approvalId } = await fixture(t);
  const approval = await run(f.client().manualCycleApproval(approvalId));
  const current = await run(f.client().manualCycleContext(approval));
  const text = manualCycleApprovalText(approval, current, id(1));
  for (const value of [
    f.rule.ruleId,
    "CHF 1.01",
    "CHF 0.51",
    "CHF 0.50",
    "Payer: You",
    "Category:",
    "Note:",
    "future rule remain unchanged",
  ])
    assert.ok(text.includes(value), value);
  const changed = {
    ...current,
    target: {
      ...current.target,
      rule: {
        ...current.target.rule,
        revision: id(999),
        configuration: {
          ...current.target.rule.configuration,
          description: "Unreviewed partner edit",
        },
      },
    },
  };
  assert.ok(!manualCycleApprovalText(approval, changed, id(1)).includes("Unreviewed partner edit"));
});
