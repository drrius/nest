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
  assert.equal(page.rules[0].updatedAt.value, "2026-01-01T10:00:00.123456Z");
  assert.deepEqual(page.rules[0].allocations.shares, [
    { memberId: id(1), centimes: "51" },
    { memberId: id(2), centimes: "50" },
  ]);
  assert.deepEqual(page.rules[0].drafts, {
    pending: "1",
    posted: "1",
    dismissed: "1",
    postedWithoutEvent: "0",
    unpostedWithEvent: "0",
    unsupportedDates: "0",
    latestDraftOn: { kind: "date", value: "2026-03-31" },
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

test("permitted unsupported legacy dates remain visible for reconciliation without invalidating the page", (t) => {
  const f = fixture(t);
  f.rule();
  f.rule(801);
  for (const [date, reason] of [
    ["infinity", "non_finite"],
    ["-infinity", "non_finite"],
    ["0001-01-01 BC", "out_of_range"],
    ["10000-01-01", "out_of_range"],
  ]) {
    f.db.sql(
      `update public.recurring_expense_rules set next_occurrence_on='${date}' where id='${id(800)}'`,
    );
    f.db.sql("delete from public.expense_drafts");
    f.draft(900, "pending", date);
    const page = f.read(),
      rule = page.rules[0];
    assert.equal(Schema.is(LegacyRecurringList)(page), true);
    assert.equal(page.rules.length, 2);
    assert.deepEqual(rule.nextOccurrenceOn, { kind: "unsupported", reason, value: date });
    assert.deepEqual(rule.drafts.latestDraftOn, rule.nextOccurrenceOn);
    assert.equal(rule.drafts.unsupportedDates, "1");
    assert.equal(page.rules[1].nextOccurrenceOn.kind, "date");
    f.draft(901, "pending", "2026-02-28");
    assert.equal(f.read().rules[0].drafts.unsupportedDates, "1");
  }
});

test("unreconciled allocation arrays and unsupported edit versions remain visible and unchanged", (t) => {
  const f = fixture(t);
  f.rule();
  f.rule(801);
  for (const split of [
    [],
    [null],
    [1, 2],
    [
      { memberId: "not-a-uuid", allocatedCents: 1 },
      { memberId: id(2), allocatedCents: 100 },
    ],
    [
      { memberId: id(1), allocatedCents: 51 },
      { memberId: id(2), allocatedCents: 51 },
    ],
  ]) {
    const encoded = JSON.stringify(split);
    f.db.sql(
      `update public.recurring_expense_rules set proposed_allocations='${encoded}'::jsonb where id='${id(800)}'`,
    );
    const page = f.read();
    assert.equal(Schema.is(LegacyRecurringList)(page), true);
    assert.deepEqual(page.rules[0].allocations, { kind: "needs_review", reason: "invalid_split" });
    assert.equal(page.rules[1].allocations.kind, "valid");
    assert.deepEqual(
      JSON.parse(
        f.db.sql(
          `select proposed_allocations from public.recurring_expense_rules where id='${id(800)}'`,
        ),
      ),
      split,
    );
  }
  for (const time of [
    "infinity",
    "-infinity",
    "0001-01-01 00:00:00+00 BC",
    "10000-01-01 00:00:00+00",
  ]) {
    f.db.sql(
      `update public.recurring_expense_rules set updated_at='${time}' where id='${id(800)}'`,
    );
    const page = f.read();
    assert.equal(Schema.is(LegacyRecurringList)(page), true);
    assert.equal(page.rules[0].updatedAt.kind, "unsupported");
    assert.equal(page.rules[1].updatedAt.kind, "timestamp");
  }
});
