import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, as, id, save, execute, read, approve } from "./recurring-mandate-fixture.mjs";
const recover = (n) => `select public.nest_read_recurring_save('${id(10)}','${id(n)}')`;
const cancel = (n) => `select public.nest_cancel_recurring_save('${id(10)}','${id(n)}')`;
function setup(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260921192950_native_recurring_save_recovery.sql");
  return f;
}
test("cancelling an unresolved Save blocks delayed mandate creation while retaining existing authorized revisions", (t) => {
  const { db, input } = setup(t);
  assert.equal(read(db, recover(100)).status, "unresolved");
  const cancelled = read(db, cancel(100));
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.receipt, null);
  assert.deepEqual(read(db, cancel(100)), cancelled);
  assert.deepEqual(read(db, recover(100)), cancelled);
  assert.throws(() => read(db, save(100, input(101))), /Save cancelled/);
  assert.equal(db.sql("select count(*) from public.nest_recurring_rules"), "0");
  const created = read(db, save(102, input(101)));
  const recovered = read(db, cancel(102));
  assert.equal(recovered.status, "recorded");
  assert.deepEqual(recovered.receipt, created);
  const edit = input(
    101,
    { description: "Later revision" },
    { expectedRevision: created.revision },
  );
  read(db, save(103, edit));
  assert.deepEqual(read(db, recover(102)), recovered);
  assert.deepEqual(read(db, save(102, input(101))), created);
  assert.equal(
    db.sql(`select status from public.nest_recurring_rules where id='${id(101)}'`),
    "active",
  );
  assert.equal(db.sql("select count(*) from public.nest_recurring_revisions"), "2");
});
test("Save/cancel races choose one outcome without partial authorization or duplicate history", async (t) => {
  const { db, input } = setup(t);
  for (let i = 0; i < 8; i++) {
    const operation = 200 + i,
      rule = 300 + i;
    const results = await Promise.allSettled([
      db.concurrent(as(1, save(operation, input(rule)))),
      db.concurrent(as(1, cancel(operation))),
    ]);
    assert.equal(results[1].status, "fulfilled");
    const status = read(db, recover(operation));
    const count = Number(
      db.sql(`select count(*) from public.nest_recurring_revisions where rule_id='${id(rule)}'`),
    );
    if (status.status === "cancelled") {
      assert.equal(count, 0);
      assert.equal(results[0].status, "rejected");
      assert.match(String(results[0].reason), /Save cancelled/);
    } else {
      assert.equal(status.status, "recorded");
      assert.equal(count, 1);
      assert.equal(results[0].status, "fulfilled");
      assert.deepEqual(read(db, save(operation, input(rule))), status.receipt);
    }
  }
  assert.equal(db.sql("select count(*) from public.financial_events"), "0");
});
test("recovery isolates members and AI approvals and cancellation receipts remain append-only", (t) => {
  const { db, input } = setup(t),
    value = input(400);
  read(db, cancel(401), 2);
  assert.equal(read(db, recover(401)).status, "unresolved");
  const created = read(db, save(401, value));
  assert.equal(read(db, recover(401)).receipt.revision, created.revision);
  assert.equal(read(db, recover(401), 2).status, "cancelled");
  assert.throws(() => read(db, recover(401), 3), /Not authorized/);
  assert.throws(() => read(db, cancel(401), 3), /Not authorized/);
  assert.throws(() => db.sql("set role anon; " + recover(401)), /permission denied/);
  assert.equal(db.sql(as(1, "select count(*) from public.nest_recurring_save_cancellations")), "0");
  assert.throws(
    () => db.sql("delete from public.nest_recurring_save_cancellations"),
    /append-only/,
  );
  const ai = input(402),
    approval = approve(db, 403, ai);
  read(db, execute(403, ai, approval));
  assert.throws(() => read(db, recover(403)), /Not a direct Save/);
  assert.throws(() => read(db, cancel(403)), /Not a direct Save/);
  db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => read(db, recover(401)), /Not authorized/);
  assert.throws(() => read(db, cancel(404)), /Not authorized/);
});
