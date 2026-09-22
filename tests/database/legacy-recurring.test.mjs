import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fixture, id, as } from "./legacy-recurring-fixture.mjs";
import { LegacyRecurringList } from "../../packages/contracts/src/legacy-recurring.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url)),
  Schema = require("effect/Schema");
function snapshot(f) {
  return f.db.sql(`select jsonb_build_object(
    'rules',(select jsonb_agg(to_jsonb(r) order by id) from public.recurring_expense_rules r),
    'drafts',(select jsonb_agg(to_jsonb(d) order by id) from public.expense_drafts d),
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e),
    'ledger',(select jsonb_agg(to_jsonb(l) order by id) from public.ledger_entries l),
    'native',(select jsonb_agg(to_jsonb(n) order by id) from public.nest_recurring_rules n),
    'cursors',(select jsonb_agg(to_jsonb(c) order by rule_id) from private.nest_recurring_execution c))`);
}
test("legacy inventory preserves draft-only mode, exact edit version and all history without writes", (t) => {
  const f = fixture(t);
  f.rule();
  f.rule(801, false);
  f.draft(900, "pending", "2026-01-31");
  f.draft(901, "posted", "2026-02-28");
  f.draft(902, "dismissed", "2026-03-31");
  f.post(901);
  const before = snapshot(f),
    page = f.read();
  assert.equal(Schema.is(LegacyRecurringList)(page), true);
  assert.equal(page.rules.length, 2);
  assert.equal(page.rules[0].mode, "legacy_draft_only");
  assert.equal(page.rules[0].updatedAt, "2026-01-01T10:00:00.123456Z");
  assert.deepEqual(page.rules[0].allocations, [
    { memberId: id(1), centimes: "51" },
    { memberId: id(2), centimes: "50" },
  ]);
  assert.deepEqual(page.rules[0].drafts, {
    pending: "1",
    posted: "1",
    dismissed: "1",
    postedWithoutEvent: "0",
    unpostedWithEvent: "0",
    latestDraftOn: "2026-03-31",
  });
  assert.equal(page.rules[1].active, false);
  assert.deepEqual(f.read(null, 2), page);
  assert.equal(snapshot(f), before);
  assert.equal(f.execute(f.scan()).jobs.length, 1); // Only the pre-existing native fixture rule.
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
});
test("reconciliation exposes inconsistent draft/event status without silently correcting it", (t) => {
  const f = fixture(t);
  f.rule();
  f.draft(900, "posted", "2026-01-31");
  f.draft(901, "pending", "2026-02-28");
  f.post(901);
  const before = snapshot(f),
    counts = f.read().rules[0].drafts;
  assert.equal(counts.postedWithoutEvent, "1");
  assert.equal(counts.unpostedWithEvent, "1");
  assert.equal(snapshot(f), before);
});
test("legacy inventory is tenant isolated and paginated without implied opt-in", (t) => {
  const f = fixture(t);
  for (let n = 800; n < 822; n++) f.rule(n, n % 2 === 0);
  const first = f.read(),
    second = f.read(first.next);
  assert.equal(first.rules.length, 20);
  assert.equal(second.rules.length, 2);
  assert.equal(second.next, null);
  assert.equal(Schema.is(LegacyRecurringList)(first), true);
  assert.equal(new Set([...first.rules, ...second.rules].map((r) => r.ruleId)).size, 22);
  assert.deepEqual(f.read(id(999)).rules, []);
  assert.throws(() => f.db.sql(as(3, f.query())), /Not authorized/);
  assert.throws(() => f.db.sql(as(1, f.query(null, 20))), /Not authorized/);
  assert.throws(() => f.db.sql(`set role anon; ${f.query()}`), /permission denied/);
  assert.throws(() => f.db.sql(f.worker(f.query())), /permission denied/);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_rules"), "1");
});
