import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fixture as worker, id, as, json } from "./recurring-worker-fixture.mjs";
import { RecurringHistory } from "../../packages/contracts/src/recurring-history.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url)),
  Schema = require("effect/Schema");
function fixture(t) {
  const f = worker(t);
  f.db.file("supabase/migrations/20260922004251_native_recurring_cycle_history.sql");
  /** @param {number} [rule] @param {string|null} [before] @param {number} [home] */
  const query = (rule = 300, before = null, home = 10) =>
    `select public.nest_read_recurring_cycles('${id(home)}','${id(rule)}',${before === null ? "null" : `'${before}'`})`;
  const read = (rule = 300, before = null) => f.record(query(rule, before));
  return { ...f, query, read };
}
test("shared history distinguishes automatic, variable and manual amounts without private receipt IDs", (t) => {
  const f = fixture(t);
  f.execute(f.job());
  const source = f.source(),
    manual = f.setup(301, source);
  f.record(f.command(manual));
  const rule = f.rule(302);
  Object.assign(rule.configuration, { mode: "variable", amountCentimes: null, allocations: null });
  const saved = f.record(
    `select public.nest_save_recurring('${id(10)}','${id(800)}',${json(rule)})`,
  );
  const input = {
    ruleId: id(302),
    expectedRevision: saved.revision,
    dueOn: f.today,
    amountCentimes: "77",
    allocations: [
      { memberId: id(1), centimes: "38" },
      { memberId: id(2), centimes: "39" },
    ],
  };
  f.record(`select public.nest_save_variable_cycle('${id(10)}','${id(801)}',${json(input)})`);
  for (const [n, kind, amount] of [
    [300, "automatic", "101"],
    [301, "manual", "990"],
    [302, "variable", "77"],
  ]) {
    const page = f.read(n);
    assert.equal(Schema.is(RecurringHistory)(page), true);
    assert.equal(page.cycles[0].source, kind);
    assert.equal(page.cycles[0].amountCentimes, amount);
    assert.equal(page.cycles[0].recordedBy, id(1));
    assert.equal(JSON.stringify(page).includes("approvalId"), false);
    assert.equal(JSON.stringify(page).includes("operationId"), false);
    assert.deepEqual(f.record(f.query(n), 2), page);
  }
  assert.equal(f.read(301).cycles[0].payerId, id(2));
  assert.equal(f.read(301).cycles[0].configuration.amountCentimes, "101");
  assert.throws(
    () => f.db.sql(as(2, "select result from public.nest_recurring_cycles")),
    /permission denied/,
  );
  assert.equal(f.db.sql(as(2, "select count(*) from public.nest_recurring_cycles")), "3");
  assert.equal(f.db.sql(as(3, "select count(*) from public.nest_recurring_cycles")), "0");
  assert.throws(() => f.record(f.query(), 3), /Not authorized/);
  assert.throws(() => f.record(f.query(300, null, 20)), /Not authorized/);
  assert.throws(() => f.db.sql(`set role anon; ${f.query()}`), /permission denied/);
  for (const date of ["infinity", "2026-2-01", "2026-02-31"])
    assert.throws(() => f.read(300, date));
});

test("history keyset pagination retains original facts after later rule changes", (t) => {
  const f = fixture(t),
    ruleId = id(900),
    revision = id(901);
  const start = f.db.sql(
    "select ((clock_timestamp() at time zone 'Europe/Zurich')::date-147)::text",
  );
  const weekday = Number(
    f.db.sql("select extract(isodow from (clock_timestamp() at time zone 'Europe/Zurich')::date)"),
  );
  const config = {
    ...f.rule().configuration,
    startDate: start,
    schedule: { kind: "weekly", weekday },
  };
  // Synthetic retained authorization predates the due periods; no production/backfill activation.
  f.db
    .sql(`insert into public.nest_recurring_rules values('${id(10)}','${ruleId}','${revision}',${json(config)},'active','${id(1)}','${start}'::timestamptz);
    insert into public.nest_recurring_revisions(household_id,rule_id,revision,authorized_by,configuration,first_due_on,created_at) values('${id(10)}','${ruleId}','${revision}','${id(1)}',${json(config)},'${start}','${start}'::timestamptz);
    insert into private.nest_recurring_execution values('${id(10)}','${ruleId}',null,'${start}')`);
  for (let n = 0; n < 22; n++) {
    const job = f.execute(f.scan()).jobs.find((v) => v.ruleId === ruleId);
    assert.ok(job);
    f.execute(f.job(1000 + n, job));
  }
  const first = f.read(900),
    last = f.read(900, first.next);
  assert.equal(first.cycles.length, 20);
  assert.equal(last.cycles.length, 2);
  assert.equal(last.next, null);
  assert.equal(Schema.is(RecurringHistory)(first), true);
  assert.equal(Schema.is(RecurringHistory)(last), true);
  assert.equal(new Set([...first.cycles, ...last.cycles].map((v) => v.eventId)).size, 22);
  f.db.sql(
    `update public.nest_recurring_rules set status='paused', configuration=jsonb_set(configuration,'{description}','"New future description"') where id='${ruleId}'`,
  );
  assert.deepEqual(f.read(900), first);
  assert.equal(f.read(900, last.cycles.at(-1).cycle.dueOn).cycles.length, 0);
});
