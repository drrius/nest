import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, as, id, save, read } from "./recurring-mandate-fixture.mjs";
/** @param {string | null} after */
const list = (after = null) =>
  `select public.nest_read_recurring_rules('${id(10)}',${after ? `'${after}'` : "null"})`;
const detail = (n) => `select public.nest_read_recurring_rule('${id(10)}','${id(n)}')`;
test("authorized recurring snapshots paginate stable identities and include current execution without side effects", (t) => {
  const { db, input } = fixture(t);
  db.file("supabase/migrations/20260921192022_native_recurring_reads.sql");
  assert.deepEqual(read(db, list()).rules, []);
  db.sql(as(1, Array.from({ length: 52 }, (_, i) => save(2000 + i, input(1000 + i))).join(";")));
  const first = read(db, list()),
    second = read(db, list(first.next), 2);
  assert.equal(first.rules.length, 50);
  assert.equal(first.next, id(1049));
  assert.equal(second.after, id(1049));
  assert.equal(second.rules.length, 2);
  assert.equal(second.next, null);
  assert.equal(new Set([...first.rules, ...second.rules].map((r) => r.ruleId)).size, 52);
  assert.deepEqual(read(db, detail(1000), 2).rule, first.rules[0]);
  db.sql(
    `update private.nest_recurring_execution set covered_through=next_due_on,next_due_on=null where rule_id='${id(1000)}'`,
  );
  const after = read(db, detail(1000));
  assert.equal(after.rule.revision, first.rules[0].revision);
  assert.equal(after.rule.coveredThrough, first.rules[0].nextDueOn);
  assert.equal(after.rule.nextDueOn, null);
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "52");
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
});
test("reads reject outsiders, missing rules, revoked membership and incomplete execution state", (t) => {
  const { db, input } = fixture(t);
  db.file("supabase/migrations/20260921192022_native_recurring_reads.sql");
  read(db, save(3001, input(3000)));
  assert.throws(() => read(db, list(), 3), /Not authorized/);
  assert.throws(() => read(db, detail(3000), 3), /Not authorized/);
  assert.throws(() => read(db, detail(3002)), /rule unavailable/);
  assert.throws(() => db.sql("set role anon; " + list()), /permission denied/);
  db.sql(`delete from private.nest_recurring_execution where rule_id='${id(3000)}'`);
  assert.throws(() => read(db, detail(3000)), /execution unavailable/);
  assert.throws(() => read(db, list()), /execution unavailable/);
  db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(db, list()), /Not authorized/);
});
