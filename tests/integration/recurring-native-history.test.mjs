import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fixture as worker, id, run } from "./recurring-worker-fixture.mjs";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { recurringReadOperations } from "../../apps/mobile/src/money/recurring-read-operations.ts";
import { RecurringReadRuntime } from "../../apps/mobile/src/money/recurring-read-runtime.ts";
import {
  cycleHistoryPage,
  cycleOriginText,
  cycleExpenseTarget,
} from "../../apps/mobile/src/money/recurring-history-display.ts";
import { PreferenceFailure } from "../../apps/mobile/src/preferences/client.ts";
import { payload } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
async function memberRpc(f, name, input) {
  const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(response.ok, true, await response.clone().text());
  return response.json();
}
async function fixture(t) {
  const f = await worker(t, [
      "supabase/migrations/20260921105214_native_money_detail_read.sql",
      "supabase/migrations/20260921232720_native_recurring_manual_cycle.sql",
      "supabase/migrations/20260922004251_native_recurring_cycle_history.sql",
    ]),
    local = await sqlite(t);
  const automatic = await f.add(800),
    manual = await f.add(801);
  await run(f.worker.execute({ jobId: id(900), input: automatic }));
  await run(f.client().saveVariableCycle(f.command));
  const expense = await memberRpc(f, "nest_save_expense", {
    p_household: id(10),
    p_operation: id(850),
    p_payload: payload({ date: automatic.dueOn }),
  });
  await memberRpc(f, "nest_save_manual_cycle", {
    p_household: id(10),
    p_operation: id(851),
    p_input: {
      ruleId: manual.ruleId,
      expectedRevision: manual.revision,
      dueOn: manual.dueOn,
      sourceEventId: expense.eventId,
    },
  });
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(950)));
  const raw = f.client();
  let failed = false;
  const operations = recurringReadOperations(
    { store: local.store, session },
    {
      recurringHistory: (input) =>
        failed
          ? Effect.fail(new PreferenceFailure({ code: "unavailable" }))
          : raw.recurringHistory(input).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    },
  );
  const runtime = new RecurringReadRuntime(operations, {
    kind: "history",
    ruleId: automatic.ruleId,
    before: null,
  });
  t.after(() => runtime.dispose());
  await runtime.setOnline(true);
  await runtime.setActive(true);
  return {
    ...f,
    local,
    automatic,
    manual,
    runtime,
    fail: (value) => {
      failed = value;
    },
  };
}
test("native cycle history shows all retained origins and links the exact original expense", async (t) => {
  const f = await fixture(t);
  for (const [ruleId, source, text] of [
    [f.automatic.ruleId, "automatic", "mandate authorized by you"],
    [f.rule.ruleId, "variable", "Variable bill confirmed by you"],
    [f.manual.ruleId, "manual", "no new expense created"],
  ]) {
    await f.runtime.select({ kind: "history", ruleId, before: null });
    const page = cycleHistoryPage(f.runtime.getSnapshot()),
      row = page.cycles[0];
    assert.equal(row.source, source);
    assert.ok(cycleOriginText(row, id(1)).includes(text));
    assert.ok(cycleOriginText(row, id(2)).includes("other household member"));
    assert.deepEqual(cycleExpenseTarget(row.eventId), {
      pathname: "/money-event",
      params: { eventId: row.eventId },
    });
    assert.equal(
      cycleHistoryPage({
        ...f.runtime.getSnapshot(),
        target: { kind: "history", ruleId: id(999), before: null },
      }),
      null,
    );
  }
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "3");
});
test("native history distinguishes failed and empty pages, hides on background/offline and fences replaced account leases", async (t) => {
  const f = await fixture(t),
    runtime = f.runtime;
  assert.equal(cycleHistoryPage(runtime.getSnapshot()).cycles.length, 1);
  await runtime.setActive(false);
  assert.equal(cycleHistoryPage(runtime.getSnapshot()), null);
  await runtime.setActive(true);
  assert.equal(cycleHistoryPage(runtime.getSnapshot()).cycles.length, 1);
  await runtime.setOnline(false);
  assert.equal(cycleHistoryPage(runtime.getSnapshot()), null);
  await runtime.setOnline(true);
  f.fail(true);
  await runtime.refresh();
  assert.equal(cycleHistoryPage(runtime.getSnapshot()), null);
  assert.match(runtime.getSnapshot().notice, /Could not load/);
  f.fail(false);
  await runtime.refresh();
  assert.equal(cycleHistoryPage(runtime.getSnapshot()).cycles.length, 1);
  await runtime.select({ kind: "history", ruleId: f.automatic.ruleId, before: f.automatic.dueOn });
  assert.deepEqual(cycleHistoryPage(runtime.getSnapshot()).cycles, []);
  await run(f.local.store.activate({ actor: id(2), household: id(10) }, id(951)));
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(cycleHistoryPage(runtime.getSnapshot()), null);
});
