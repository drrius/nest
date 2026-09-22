import { createRequire } from "node:module";
import { fixture as sqlite } from "../../apps/mobile/tests/offline-fixture.mjs";
import { recurringReadOperations } from "../../apps/mobile/src/money/recurring-read-operations.ts";
import { RecurringReadRuntime } from "../../apps/mobile/src/money/recurring-read-runtime.ts";
import {
  legacyDraftPage,
  legacyDraftWarning,
} from "../../apps/mobile/src/money/legacy-draft-display.ts";
import { cycleExpenseTarget } from "../../apps/mobile/src/money/recurring-history-display.ts";
import { PreferenceFailure } from "../../apps/mobile/src/preferences/client.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { fixture as worker, id, run } from "./recurring-worker-fixture.mjs";
import { recurringReadTools } from "../../apps/api/src/money/recurring-tools.ts";
async function fixture(t) {
  const f = await worker(t, [
    "tests/database/legacy-recurring/rules.sql",
    "tests/database/legacy-recurring/draft-columns.sql",
    "supabase/migrations/20260922005927_native_legacy_recurring_inventory.sql",
    "supabase/migrations/20260922012902_native_legacy_recurring_drafts.sql",
  ]);
  f.db
    .sql(`insert into public.recurring_expense_rules(id,household_id,description,amount_cents,payer_member_id,proposed_allocations,schedule_kind,iso_weekday,active,next_occurrence_on) values('${id(800)}','${id(10)}','Changed rule',999,'${id(1)}','[]','weekly',1,true,'2026-01-05');
  insert into public.expense_drafts(id,household_id,recurring_expense_rule_id,description,amount_cents,payer_member_id,proposed_allocations,occurred_on,updated_at) values('${id(900)}','${id(10)}','${id(800)}','Original draft',9007199254740991,'${id(1)}','[{"memberId":"${id(1)}","allocatedCents":4503599627370495},{"memberId":"${id(2)}","allocatedCents":4503599627370496}]','2026-01-05','2026-01-01 10:00:00.123456+00')`);
  return f;
}
test("native and actual SDK draft reads share exact historical terms, cursor and household binding", async (t) => {
  const f = await fixture(t),
    input = { ruleId: id(800), after: null },
    page = await run(f.client().legacyDrafts(input));
  assert.equal(page.drafts[0].description, "Original draft");
  assert.equal(page.drafts[0].amountCentimes, "9007199254740991");
  assert.equal(page.drafts[0].allocations.shares[1].centimes, "4503599627370496");
  assert.equal(page.drafts[0].updatedAt.value, "2026-01-01T10:00:00.123456Z");
  const tools = recurringReadTools(
    new Request("http://localhost/", { headers: { authorization: `Bearer ${f.bearer}` } }),
    { url: f.supabaseUrl, publishableKey: "sb_publishable_fixture" },
  );
  const result = await tools.listLegacyRecurringDrafts.execute(input, {
    toolCallId: "drafts",
    messages: [],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, page);
  assert.deepEqual((await run(f.client().legacyDrafts({ ...input, after: id(900) }))).drafts, []);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("draft HTTP denies malformed queries and unauthorized households without confusing missing rules with empty history", async (t) => {
  const f = await fixture(t),
    input = { ruleId: id(800), after: null };
  await assert.rejects(run(f.client(f.url, 3, f.otherBearer).legacyDrafts(input)));
  await assert.rejects(run(f.client().legacyDrafts({ ...input, ruleId: id(999) })));
  for (const query of [
    "",
    `ruleId=${id(800)}&ruleId=${id(800)}`,
    `ruleId=${id(800)}&after=${id(900)}&after=${id(900)}`,
    `ruleId=${id(800)}&status=posted`,
    "ruleId=bad",
  ]) {
    const response = await fetch(`${f.url}/v1/money/recurring/legacy-drafts?${query}`, {
      headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
    });
    assert.equal(response.status, 400);
  }
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});

const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url)),
  Effect = require("effect/Effect"),
  Fetch = require("effect/unstable/http/FetchHttpClient");
test("native draft review binds original event links and hides rows after errors, inactivity and account replacement", async (t) => {
  const f = await fixture(t),
    local = await sqlite(t),
    client = f.client();
  const eventId = f.db.sql(
    `select private.post_financial_event(household_id,'${id(1)}','expense',payer_member_id,description,amount_cents,proposed_allocations,occurred_on,null,null,null,null,null,id,null) from public.expense_drafts where id='${id(900)}'`,
  );
  const session = await run(local.store.activate({ actor: id(1), household: id(10) }, id(950)));
  let failed = false;
  const operations = recurringReadOperations(
    { store: local.store, session },
    {
      legacyDrafts: (input) =>
        failed
          ? Effect.fail(new PreferenceFailure({ code: "unavailable" }))
          : client.legacyDrafts(input).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    },
  );
  const runtime = new RecurringReadRuntime(operations, {
    kind: "legacy-drafts",
    ruleId: id(800),
    after: null,
  });
  t.after(() => runtime.dispose());
  await runtime.setOnline(true);
  await runtime.setActive(true);
  const row = legacyDraftPage(runtime.getSnapshot()).drafts[0];
  assert.equal(row.eventId, eventId);
  assert.match(legacyDraftWarning(row), /already linked.*Do not record/);
  assert.deepEqual(cycleExpenseTarget(row.eventId), {
    pathname: "/money-event",
    params: { eventId },
  });
  assert.equal(
    legacyDraftPage({
      ...runtime.getSnapshot(),
      target: { kind: "legacy-drafts", ruleId: id(801), after: null },
    }),
    null,
  );
  await runtime.setActive(false);
  assert.equal(legacyDraftPage(runtime.getSnapshot()), null);
  await runtime.setActive(true);
  await runtime.setOnline(false);
  assert.equal(legacyDraftPage(runtime.getSnapshot()), null);
  await runtime.setOnline(true);
  failed = true;
  await runtime.refresh();
  assert.equal(legacyDraftPage(runtime.getSnapshot()), null);
  assert.match(runtime.getSnapshot().notice, /Could not load/);
  failed = false;
  await runtime.refresh();
  assert.equal(legacyDraftPage(runtime.getSnapshot()).drafts.length, 1);
  await runtime.select({ kind: "legacy-drafts", ruleId: id(800), after: id(900) });
  assert.deepEqual(legacyDraftPage(runtime.getSnapshot()).drafts, []);
  await run(local.store.activate({ actor: id(2), household: id(10) }, id(951)));
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().verify, true);
  assert.equal(legacyDraftPage(runtime.getSnapshot()), null);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
