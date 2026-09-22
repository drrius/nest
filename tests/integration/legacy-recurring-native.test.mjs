import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fixture as worker, id, run } from "./recurring-worker-fixture.mjs";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { recurringReadOperations } from "../../apps/mobile/src/money/recurring-read-operations.ts";
import { RecurringReadRuntime } from "../../apps/mobile/src/money/recurring-read-runtime.ts";
import {
  legacyRecurringPage,
  legacyDescription,
  legacyDateText,
  legacyWarnings,
} from "../../apps/mobile/src/money/legacy-recurring-display.ts";
import { PreferenceFailure } from "../../apps/mobile/src/preferences/client.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
async function fixture(t) {
  const f = await worker(t, [
      "tests/database/legacy-recurring/rules.sql",
      "tests/database/legacy-recurring/draft-columns.sql",
      "supabase/migrations/20260922005927_native_legacy_recurring_inventory.sql",
    ]),
    local = await sqlite(t);
  for (let n = 800; n < 822; n++)
    f.db.sql(
      `insert into public.recurring_expense_rules(id,household_id,description,amount_cents,payer_member_id,proposed_allocations,schedule_kind,iso_weekday,active,next_occurrence_on,updated_at) values('${id(n)}','${id(10)}','Legacy ${n}',101,'${id(1)}','[]','weekly',1,true,'infinity','infinity')`,
    );
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(950)));
  let fail = false;
  const client = f.client(),
    operations = recurringReadOperations(
      { store: local.store, session },
      {
        legacyRecurring: (after) =>
          fail
            ? Effect.fail(new PreferenceFailure({ code: "unavailable" }))
            : client.legacyRecurring(after).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      },
    );
  const runtime = new RecurringReadRuntime(operations, { kind: "legacy", after: null });
  t.after(() => runtime.dispose());
  await runtime.setOnline(true);
  await runtime.setActive(true);
  return {
    ...f,
    local,
    runtime,
    fail: (value) => {
      fail = value;
    },
  };
}
test("native legacy inventory pages retained rules and exposes unsupported terms without posting", async (t) => {
  const f = await fixture(t),
    runtime = f.runtime,
    first = legacyRecurringPage(runtime.getSnapshot());
  assert.equal(first.rules.length, 20);
  assert.equal(first.rules[0].mode, "legacy_draft_only");
  assert.match(legacyDateText(first.rules[0].nextOccurrenceOn), /Needs review \(infinity\)/);
  assert.match(
    legacyWarnings(first.rules[0]).join(" "),
    /split needs review.*edit version needs review/,
  );
  assert.equal(
    legacyDescription("\u00a0\t\n"),
    "Legacy expense with a whitespace-only description",
  );
  assert.equal(legacyDescription("  Retained label  "), "Retained label");
  await runtime.select({ kind: "legacy", after: first.next });
  const second = legacyRecurringPage(runtime.getSnapshot());
  assert.equal(second.rules.length, 2);
  assert.equal(new Set([...first.rules, ...second.rules].map((r) => r.ruleId)).size, 22);
  assert.equal(
    legacyRecurringPage({ ...runtime.getSnapshot(), target: { kind: "legacy", after: null } }),
    null,
  );
  await runtime.select({ kind: "legacy", after: second.rules.at(-1).ruleId });
  assert.deepEqual(legacyRecurringPage(runtime.getSnapshot()).rules, []);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_rules"), "1");
  assert.equal(f.db.sql("select count(*) from public.expense_drafts"), "0");
});
test("native legacy reads distinguish failures, recover online and fence replaced accounts", async (t) => {
  const f = await fixture(t),
    runtime = f.runtime;
  await runtime.setActive(false);
  assert.equal(legacyRecurringPage(runtime.getSnapshot()), null);
  await runtime.setActive(true);
  assert.equal(legacyRecurringPage(runtime.getSnapshot()).rules.length, 20);
  await runtime.setOnline(false);
  assert.equal(legacyRecurringPage(runtime.getSnapshot()), null);
  await runtime.setOnline(true);
  f.fail(true);
  await runtime.refresh();
  assert.equal(legacyRecurringPage(runtime.getSnapshot()), null);
  assert.match(runtime.getSnapshot().notice, /Could not load/);
  f.fail(false);
  await runtime.refresh();
  assert.equal(legacyRecurringPage(runtime.getSnapshot()).rules.length, 20);
  await run(f.local.store.activate({ actor: id(2), household: id(10) }, id(951)));
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(legacyRecurringPage(runtime.getSnapshot()), null);
});
