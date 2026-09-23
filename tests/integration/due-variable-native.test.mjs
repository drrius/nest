import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { recurringReadOperations } from "../../apps/mobile/src/money/recurring-read-operations.ts";
import { RecurringReadRuntime } from "../../apps/mobile/src/money/recurring-read-runtime.ts";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
test("native due-bill reader clears offline, retries, and fences replaced SQLite accounts", async (t) => {
  const f = await recurringApiFixture(t, [
    "supabase/migrations/20260923031451_native_due_variable_rules.sql",
  ]);
  const local = await sqlite(t),
    raw = f.client();
  const today = f.db.sql("select (clock_timestamp() at time zone 'Europe/Zurich')::date");
  const weekday = Number(f.db.sql(`select extract(isodow from date '${today}')`));
  await run(
    raw.saveRecurring({
      operationId: id(2000),
      rule: {
        ...f.rule,
        firstDueOn: today,
        configuration: {
          ...f.rule.configuration,
          mode: "variable",
          amountCentimes: null,
          allocations: null,
          startDate: today,
          schedule: { kind: "weekly", weekday },
        },
      },
    }),
  );
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(900)));
  const client = {
    dueVariableRules: (after) =>
      raw.dueVariableRules(after).pipe(Effect.provideService(Fetch.Fetch, fetch)),
  };
  const runtime = new RecurringReadRuntime(
    recurringReadOperations({ store: local.store, session }, client),
    { kind: "due-variable", after: null },
  );
  t.after(() => runtime.dispose());
  await runtime.setOnline(true);
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().entry.value.rules[0].ruleId, f.rule.ruleId);
  await runtime.setOnline(false);
  assert.equal(runtime.getSnapshot().entry, null);
  await runtime.setOnline(true);
  assert.equal(runtime.getSnapshot().entry.value.rules.length, 1);
  await runtime.setActive(false);
  assert.equal(runtime.getSnapshot().entry, null);
  await runtime.setActive(true);
  await run(local.store.activate({ actor: id(2), household: id(10) }, id(901)));
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().entry, null);
  assert.equal(runtime.getSnapshot().verify, true);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().entry, null);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
