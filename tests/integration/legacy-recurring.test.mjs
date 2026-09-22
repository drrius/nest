import assert from "node:assert/strict";
import test from "node:test";
import { fixture as worker, id, run } from "./recurring-worker-fixture.mjs";
import { recurringReadTools } from "../../apps/api/src/money/recurring-tools.ts";
async function fixture(t) {
  const f = await worker(t, [
    "tests/database/legacy-recurring/rules.sql",
    "tests/database/legacy-recurring/draft-columns.sql",
    "supabase/migrations/20260922005927_native_legacy_recurring_inventory.sql",
  ]);
  f.db
    .sql(`insert into public.recurring_expense_rules(id,household_id,description,amount_cents,payer_member_id,proposed_allocations,schedule_kind,iso_weekday,active,next_occurrence_on,updated_at)
    values('${id(800)}','${id(10)}','Retained legacy obligation',9007199254740991,'${id(1)}',
    '[{"memberId":"${id(1)}","allocatedCents":4503599627370495},{"memberId":"${id(2)}","allocatedCents":4503599627370496}]',
    'weekly',1,true,'2026-01-05','2026-01-01 10:00:00.123456+00')`);
  return f;
}
test("native and actual SDK legacy reads preserve exact centimes and version without adopting", async (t) => {
  const f = await fixture(t),
    page = await run(f.client().legacyRecurring());
  assert.equal(page.rules[0].mode, "legacy_draft_only");
  assert.equal(page.rules[0].amountCentimes, "9007199254740991");
  assert.equal(page.rules[0].allocations.shares[1].centimes, "4503599627370496");
  assert.equal(page.rules[0].updatedAt.value, "2026-01-01T10:00:00.123456Z");
  const tools = recurringReadTools(
    new Request("http://localhost/", { headers: { authorization: `Bearer ${f.bearer}` } }),
    { url: f.supabaseUrl, publishableKey: "sb_publishable_fixture" },
  );
  const result = await tools.listLegacyRecurringRules.execute(
    { after: null },
    { toolCallId: "legacy", messages: [] },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, page);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_rules"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from public.expense_drafts"), "0");
});
test("legacy API denies foreign household and malformed pagination without mutation", async (t) => {
  const f = await fixture(t);
  await assert.rejects(run(f.client(f.url, 3, f.otherBearer).legacyRecurring()));
  for (const query of [`after=${id(800)}&after=${id(801)}`, "mode=fixed", "after=bad"]) {
    const response = await fetch(`${f.url}/v1/money/recurring/legacy?${query}`, {
      headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
    });
    assert.equal(response.status, 400);
  }
  assert.deepEqual((await run(f.client().legacyRecurring(id(800)))).rules, []);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});

test("native and SDK inventory keep unsupported legacy rows visible without treating them as valid terms", async (t) => {
  const f = await fixture(t);
  f.db.sql(
    "update public.recurring_expense_rules set next_occurrence_on='infinity',updated_at='infinity',proposed_allocations='[]',description=U&'\\00A0'",
  );
  const page = await run(f.client().legacyRecurring()),
    row = page.rules[0];
  assert.equal(row.allocations.kind, "needs_review");
  assert.equal(row.description, "\u00a0");
  assert.equal(row.nextOccurrenceOn.kind, "unsupported");
  assert.equal(row.updatedAt.kind, "unsupported");
  const tool = recurringReadTools(
    new Request("http://localhost/", { headers: { authorization: `Bearer ${f.bearer}` } }),
    { url: f.supabaseUrl, publishableKey: "sb_publishable_fixture" },
  ).listLegacyRecurringRules;
  const result = await tool.execute({ after: null }, { toolCallId: "reconcile", messages: [] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, page);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
