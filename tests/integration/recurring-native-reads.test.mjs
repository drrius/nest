import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { recurringReadOperations } from "../../apps/mobile/src/money/recurring-read-operations.ts";
import { RecurringReadRuntime } from "../../apps/mobile/src/money/recurring-read-runtime.ts";
import { recurringApiFixture, id, run } from "./recurring-api-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
test("native read runtime loads saved mandate over HTTP and hides it after membership revocation", async (t) => {
  const f = await recurringApiFixture(t),
    local = await sqlite(t),
    raw = f.client();
  const saved = await run(raw.saveRecurring({ operationId: id(700), rule: f.rule }));
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(900)));
  const client = {
    recurringRules: (after) =>
      raw.recurringRules(after).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    recurringRule: (ruleId) =>
      raw.recurringRule(ruleId).pipe(Effect.provideService(Fetch.Fetch, fetch)),
  };
  const runtime = new RecurringReadRuntime(
    recurringReadOperations({ store: local.store, session }, client),
    { kind: "list", after: null },
  );
  await runtime.setOnline(true);
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().entry.value.rules.length, 1);
  await runtime.select({ kind: "detail", ruleId: f.rule.ruleId });
  assert.equal(runtime.getSnapshot().entry.value.rule.revision, saved.revision);
  assert.deepEqual(runtime.getSnapshot().entry.value.rule.configuration, saved.rule.configuration);
  await runtime.setOnline(false);
  assert.equal(runtime.getSnapshot().entry, null);
  await runtime.setOnline(true);
  assert.equal(runtime.getSnapshot().entry.value.rule.revision, saved.revision);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().entry, null);
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  runtime.dispose();
});
