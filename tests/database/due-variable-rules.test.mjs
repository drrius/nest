import test from "node:test";
import assert from "node:assert/strict";
import { fixture, as, id, save, read } from "./recurring-mandate-fixture.mjs";
function setup(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260921192022_native_recurring_reads.sql");
  f.db.file("supabase/migrations/20260923031451_native_due_variable_rules.sql");
  const today = f.db.sql("select (clock_timestamp() at time zone 'Europe/Zurich')::date");
  const weekday = Number(f.db.sql(`select extract(isodow from date '${today}')`));
  const config = {
    mode: "variable",
    amountCentimes: null,
    allocations: null,
    startDate: today,
    schedule: { kind: "weekly", weekday },
  };
  const list = (after = null) =>
    `select public.nest_read_due_variable_rules('${id(10)}',${after ? `'${String(after)}'` : "null"})`;
  return { ...f, today, config, list };
}
test("due variable rules paginate eligible configurations without posting money", (t) => {
  const f = setup(t);
  f.db.sql(
    as(
      1,
      Array.from({ length: 52 }, (_, i) => save(2000 + i, f.input(1000 + i, f.config))).join(";"),
    ),
  );
  read(f.db, save(3000, f.input(3001)));
  read(f.db, save(3002, f.input(3003, { ...f.config, startDate: f.start })));
  const first = read(f.db, f.list()),
    second = read(f.db, f.list(first.next), 2);
  assert.equal(first.rules.length, 50);
  assert.equal(second.rules.length, 2);
  assert.equal(second.next, null);
  assert.ok(
    [...first.rules, ...second.rules].every(
      (r) => r.configuration.mode === "variable" && r.nextDueOn === f.today,
    ),
  );
  f.db.sql(`update public.nest_recurring_rules set status='paused' where id='${id(1000)}'`);
  assert.ok(!read(f.db, f.list()).rules.some((r) => r.ruleId === id(1000)));
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("due reads reject outsiders and missing execution instead of reporting an empty queue", (t) => {
  const f = setup(t);
  read(f.db, save(3000, f.input(1000, f.config)));
  assert.throws(() => read(f.db, f.list(), 3), /Not authorized/);
  assert.throws(() => f.db.sql("set role anon;" + f.list()), /permission denied/);
  f.db.sql(`delete from private.nest_recurring_execution where rule_id='${id(1000)}'`);
  assert.throws(() => read(f.db, f.list()), /execution unavailable/);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(f.db, f.list()), /Not authorized/);
});
