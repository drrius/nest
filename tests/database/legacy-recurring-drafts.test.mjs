import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fixture as legacy, id, as } from "./legacy-recurring-fixture.mjs";
import { LegacyDraftList } from "../../packages/contracts/src/legacy-recurring-drafts.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url)),
  Schema = require("effect/Schema");
function fixture(t) {
  const f = legacy(t);
  f.db.file("supabase/migrations/20260922012902_native_legacy_recurring_drafts.sql");
  f.rule();
  /** @param {number} [rule] @param {string|null} [after] */
  const query = (rule = 800, after = null) =>
    `select public.nest_read_legacy_drafts('${id(10)}','${id(rule)}',${after === null ? "null" : `'${after}'`})`;
  return {
    ...f,
    query,
    drafts: (rule = 800, after = null, actor = 1) => f.record(query(rule, after), actor),
  };
}
function snapshot(f) {
  return f.db.sql(
    `select jsonb_build_object('rules',(select jsonb_agg(to_jsonb(r)) from public.recurring_expense_rules r),'drafts',(select jsonb_agg(to_jsonb(d)) from public.expense_drafts d),'events',(select jsonb_agg(to_jsonb(e)) from public.financial_events e),'ledger',(select jsonb_agg(to_jsonb(l)) from public.ledger_entries l))`,
  );
}
test("legacy draft reads preserve original bodies and exact event relationships without repairing discrepancies", (t) => {
  const f = fixture(t);
  f.draft(900, "posted", "2026-01-31");
  f.draft(901, "pending", "2026-02-28");
  f.draft(902, "dismissed", "2026-03-31");
  const event = f.post(901);
  f.db.sql("update public.recurring_expense_rules set description='Changed rule',amount_cents=999");
  f.db.sql("update public.expense_drafts set updated_at='2026-01-01 10:00:00.123456+00'");
  const before = snapshot(f),
    page = f.drafts();
  assert.equal(Schema.is(LegacyDraftList)(page), true);
  assert.equal(page.drafts[0].description, "Retained original draft");
  assert.equal(page.drafts[0].amountCentimes, "101");
  assert.equal(page.drafts[0].updatedAt.value, "2026-01-01T10:00:00.123456Z");
  assert.equal(page.drafts[0].status, "posted");
  assert.equal(page.drafts[0].eventId, null);
  assert.equal(page.drafts[1].status, "pending");
  assert.equal(page.drafts[1].eventId, event);
  assert.equal(page.drafts[2].status, "dismissed");
  assert.deepEqual(f.drafts(800, null, 2), page);
  assert.equal(snapshot(f), before);
});
test("incomplete and unsupported legacy draft terms remain visible and never inherit rule values", (t) => {
  const f = fixture(t);
  f.draft(900, "pending", "infinity");
  f.db.sql(
    "update public.expense_drafts set amount_cents=null,payer_member_id=null,proposed_allocations='[]',description=U&'\\00A0',updated_at='-infinity'",
  );
  const page = f.drafts(),
    row = page.drafts[0];
  assert.equal(Schema.is(LegacyDraftList)(page), true);
  assert.equal(row.amountCentimes, null);
  assert.equal(row.payerId, null);
  assert.equal(row.description, "\u00a0");
  assert.equal(row.allocations.kind, "needs_review");
  assert.equal(row.updatedAt.kind, "unsupported");
  assert.equal(row.occurredOn.kind, "unsupported");
  assert.equal(row.eventId, null);
});
test("draft pagination is rule bound and rejects foreign rules, outsiders, anonymous and service callers", (t) => {
  const f = fixture(t);
  f.rule(801);
  for (let n = 900; n < 922; n++)
    f.draft(n, "pending", `2026-01-${String(n - 899).padStart(2, "0")}`);
  const first = f.drafts(),
    second = f.drafts(800, first.next);
  assert.equal(first.drafts.length, 20);
  assert.equal(second.drafts.length, 2);
  assert.equal(new Set([...first.drafts, ...second.drafts].map((d) => d.draftId)).size, 22);
  assert.equal(second.next, null);
  assert.deepEqual(f.drafts(801).drafts, []);
  assert.throws(() => f.drafts(999), /Legacy rule unavailable/);
  assert.throws(() => f.drafts(800, null, 3), /Not authorized/);
  assert.throws(() => f.db.sql(`set role anon; ${f.query()}`), /permission denied/);
  assert.throws(() => f.db.sql(`set role service_role; ${f.query()}`), /permission denied/);
  assert.throws(
    () =>
      f.db.sql(
        as(1, "select private.nest_legacy_draft_document(d) from public.expense_drafts d limit 1"),
      ),
    /permission denied/,
  );
});
