import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as mandates, read, save, as, id } from "./recurring-mandate-fixture.mjs";
import { firstUncoveredRecurringCycle } from "../../packages/domain/src/money/recurring-cycle.ts";
import { FixedRecurringCycleReceipt } from "../../packages/contracts/src/recurring-cycle.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
function fixture(t, config = {}) {
  const f = mandates(t);
  f.db.file("supabase/migrations/20260921205157_native_recurring_fixed_cycle.sql");
  const today = f.db.sql(
    "select to_char((clock_timestamp() at time zone 'Europe/Zurich')::date,'YYYY-MM-DD')",
  );
  const input = f.input(100, {
    startDate: today,
    schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
    ...config,
  });
  const receipt = read(f.db, save(500, input));
  const post = (revision = receipt.revision, due = input.firstDueOn) =>
    `select private.nest_post_fixed_cycle('${id(10)}','${input.ruleId}','${revision}','${due}')`;
  return { ...f, input, receipt, post, today };
}
test("concurrent fixed posting claims one civil cycle, retains its mandate and advances coverage atomically", async (t) => {
  const f = fixture(t);
  const rows = await Promise.all(Array.from({ length: 5 }, () => f.db.concurrent(f.post())));
  const results = rows.map((row) => JSON.parse(row.stdout));
  for (const result of results) assert.deepEqual(result, results[0]);
  const result = results[0];
  assert.equal(Schema.is(FixedRecurringCycleReceipt)(result), true);
  assert.deepEqual(result.configuration, f.input.configuration);
  assert.equal(result.authorizedBy, id(1));
  assert.equal(result.source, "automatic");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
  assert.equal(f.db.sql("select sum(receivable_delta_cents) from public.ledger_entries"), "0");
  assert.equal(
    f.db.sql(`select receivable_delta_cents from public.ledger_entries where member_id='${id(1)}'`),
    "50",
  );
  assert.equal(
    f.db.sql("select covered_through::text from private.nest_recurring_execution"),
    result.cycle.through,
  );
  assert.equal(
    f.db.sql("select revision::text from public.nest_recurring_rules"),
    f.receipt.revision,
  );
  assert.throws(() => f.db.sql(f.post(id(999))), /mandate changed/);
  assert.throws(() => f.db.sql(as(1, f.post())), /permission denied/);
  assert.equal(f.db.sql(as(2, "select count(*) from public.nest_recurring_cycles")), "1");
  assert.equal(f.db.sql(as(3, "select count(*) from public.nest_recurring_cycles")), "0");
  assert.throws(
    () => f.db.sql("delete from public.nest_recurring_cycles"),
    /append.only|immutable|cannot|not allowed/i,
  );
  f.db.sql("update public.nest_recurring_rules set status='paused'");
  assert.deepEqual(JSON.parse(f.db.sql(f.post())), result);
});
test("cycle persistence failure rolls back the ledger and cursor; retry posts exactly once", (t) => {
  const f = fixture(t);
  f.db.sql(
    "alter table public.nest_recurring_cycles add constraint fixture_cycle_failure check(false) not valid",
  );
  assert.throws(() => f.db.sql(f.post()), /fixture_cycle_failure/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select next_due_on::text from private.nest_recurring_execution"), f.today);
  assert.equal(
    f.db.sql(
      "select count(*) from private.nest_recurring_execution where covered_through is not null",
    ),
    "0",
  );
  f.db.sql("alter table public.nest_recurring_cycles drop constraint fixture_cycle_failure");
  assert.equal(Schema.is(FixedRecurringCycleReceipt)(JSON.parse(f.db.sql(f.post()))), true);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
test("future, stale, paused/cancelled and revoked mandates never post a fixed cycle", (t) => {
  const f = fixture(t);
  assert.throws(() => f.db.sql(f.post(id(999))), /mandate changed/);
  assert.throws(
    () => f.db.sql(f.post(f.receipt.revision, "9999-12-31")),
    /next authorized due date/,
  );
  for (const state of ["paused", "cancelled"]) {
    f.db.sql(`update public.nest_recurring_rules set status='${state}'`);
    assert.throws(() => f.db.sql(f.post()), /mandate changed/);
  }
  f.db.sql("update public.nest_recurring_rules set status='active'");
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.db.sql(f.post()), /two current members/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("variable bills cannot enter the automatic fixed posting path", (t) => {
  const f = fixture(t, { mode: "variable", amountCentimes: null, allocations: null });
  assert.throws(() => f.db.sql(f.post()), /mandate changed/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
});
test("cadence edits preserve consumed period coverage and an old retry returns its original receipt", (t) => {
  const f = fixture(t),
    posted = JSON.parse(f.db.sql(f.post()));
  const configuration = { ...f.input.configuration, schedule: { kind: "weekly", weekday: 1 } };
  const first = firstUncoveredRecurringCycle(configuration.schedule, {
    from: f.today,
    coveredThrough: posted.cycle.through,
  });
  const changed = {
    ...f.input,
    expectedRevision: f.receipt.revision,
    configuration,
    firstDueOn: first.dueOn,
  };
  const saved = read(f.db, save(501, changed));
  assert.notEqual(saved.revision, f.receipt.revision);
  assert.ok(first.startsOn > posted.cycle.through);
  assert.deepEqual(JSON.parse(f.db.sql(f.post())), posted);
  assert.equal(
    f.db.sql("select covered_through::text from private.nest_recurring_execution"),
    posted.cycle.through,
  );
  assert.equal(
    f.db.sql("select next_due_on::text from private.nest_recurring_execution"),
    first.dueOn,
  );
  assert.throws(() => f.db.sql(f.post(saved.revision, first.dueOn)), /next authorized due date/);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "1");
});
