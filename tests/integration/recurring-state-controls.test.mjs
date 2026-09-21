import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { RecurringReadRuntime } from "../../apps/mobile/src/money/recurring-read-runtime.ts";
import { recurringReadOperations } from "../../apps/mobile/src/money/recurring-read-operations.ts";
import { RecurringStateSaveRuntime } from "../../apps/mobile/src/money/recurring-state-save-runtime.ts";
import { recurringStateSaveOperations } from "../../apps/mobile/src/money/recurring-state-save-operations.ts";
import {
  currentStateRule,
  prepareStateConfirmation,
  stateConfirmationCurrent,
} from "../../apps/mobile/src/money/recurring-state-confirmation.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
async function fixture(t) {
  const f = await recurringApiFixture(t, [
    "supabase/migrations/20260921210444_native_recurring_state_command.sql",
    "supabase/migrations/20260921211106_native_recurring_state_recovery.sql",
  ]);
  await run(f.client().saveRecurring({ operationId: id(600), rule: f.rule }));
  const local = await sqlite(t);
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(900)));
  const raw = f.client(),
    client = Object.fromEntries(
      Object.entries(raw).map(([key, method]) => [
        key,
        (...args) => method(...args).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      ]),
    );
  const account = { store: local.store, session };
  const read = new RecurringReadRuntime(recurringReadOperations(account, client), {
    kind: "detail",
    ruleId: f.rule.ruleId,
  });
  const save = new RecurringStateSaveRuntime(recurringStateSaveOperations(account, client));
  t.after(() => {
    read.dispose();
    save.dispose();
  });
  await read.setOnline(true);
  await read.setActive(true);
  await save.setOnline(true);
  await save.setActive(true);
  const capture = (action, op) =>
    prepareStateConfirmation(
      currentStateRule(read.getSnapshot(), save.getSnapshot()),
      action,
      id(op),
    );
  const confirm = async (expected) => {
    if (stateConfirmationCurrent(expected, read.getSnapshot(), save.getSnapshot()))
      await save.save(expected.command);
  };
  return { ...f, read, save, capture, confirm };
}
test("native-control confirmation boundary rejects stale alerts and performs pause then cancellation against the current rule", async (t) => {
  const f = await fixture(t),
    stale = f.capture("pause", 700);
  await f.read.refresh();
  await f.confirm(stale);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_state_receipts"), "0");
  const background = f.capture("pause", 701);
  await f.save.setActive(false);
  await f.confirm(background);
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "active");
  await f.read.setActive(false);
  await f.read.setActive(true);
  await f.save.setActive(true);
  await f.confirm(background);
  const pause = f.capture("pause", 702);
  await f.confirm(pause);
  assert.equal(f.save.getSnapshot().result.receipt.status, "paused");
  await f.confirm(pause);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_state_receipts"), "1");
  f.save.acknowledge();
  await f.read.refresh();
  assert.equal(f.capture("pause", 703), null);
  await f.confirm(f.capture("cancel", 704));
  assert.equal(f.save.getSnapshot().result.receipt.status, "cancelled");
  f.save.acknowledge();
  await f.read.refresh();
  assert.equal(f.capture("pause", 705), null);
  assert.equal(f.capture("cancel", 706), null);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("partner edit invalidates a captured rule at the server; explicit abandonment resolves the conflict without stopping a newer revision", async (t) => {
  const f = await fixture(t),
    captured = f.capture("pause", 700);
  await run(
    f.client(f.url, 2, f.partnerBearer).saveRecurring({
      operationId: id(601),
      rule: {
        ...f.rule,
        expectedRevision: captured.command.change.expectedRevision,
        configuration: { ...f.rule.configuration, description: "Changed by partner" },
      },
    }),
  );
  await f.confirm(captured);
  assert.equal(f.save.getSnapshot().fresh, false);
  assert.equal(f.save.getSnapshot().result, null);
  await f.save.refresh();
  assert.equal(f.save.getSnapshot().result.status, "unresolved");
  assert.equal(currentStateRule(f.read.getSnapshot(), f.save.getSnapshot()), null);
  await f.save.abandon(f.save.getSnapshot().attempt);
  assert.equal(f.save.getSnapshot().result.status, "cancelled");
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "active");
  f.save.acknowledge();
  await f.read.refresh();
  assert.equal(
    currentStateRule(f.read.getSnapshot(), f.save.getSnapshot()).configuration.description,
    "Changed by partner",
  );
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_state_receipts"), "0");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
