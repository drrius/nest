import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture as base, id, as, command, approve } from "./native-correction-fixture.mjs";
function fixture(t) {
  const f = base(t);
  f.db.file("supabase/migrations/20260921161648_native_correction_save_cancel.sql");
  return f;
}
const cancel = (op) => `select public.nest_cancel_correction_save('${id(10)}','${id(op)}')`;
const read = (op) => `select public.nest_read_correction_save('${id(10)}','${id(op)}')`;
test("correction cancellation is permanent, private, immutable and does not modify history", async (t) => {
  const f = fixture(t),
    payload = f.payload();
  assert.equal(f.record(read(100)).status, "unresolved");
  const outcomes = await Promise.all(
    Array.from({ length: 6 }, () => f.db.concurrent(as(1, cancel(100)))),
  );
  for (const value of outcomes) assert.equal(JSON.parse(value.stdout).status, "cancelled");
  assert.throws(() => f.record(command(100, payload)), /Save cancelled/);
  assert.throws(
    () => f.record(command(100, { ...payload, note: "Late change" })),
    /Save cancelled/,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.record(read(100), 2).status, "unresolved");
  assert.equal(f.record(command(100, payload), 2).actorId, id(2));
  assert.equal(
    f.db.sql(as(2, "select count(*) from public.nest_correction_save_cancellations")),
    "0",
  );
  assert.throws(() => f.record(cancel(101), 3), /Not authorized/);
  assert.throws(() => f.db.sql(`set role anon; ${cancel(101)}`), /permission denied/);
  assert.throws(
    () => f.db.sql(as(1, "delete from public.nest_correction_save_cancellations")),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql("delete from public.nest_correction_save_cancellations"),
    /append-only/,
  );
  assert.throws(() => f.record(read(100), 3), /Not authorized/);
});
test("20 correction Save/cancel races converge without reversing a recorded correction", async (t) => {
  const f = fixture(t);
  for (let index = 0; index < 20; index++) {
    const source = f.seed(`cancel-race-${index}`, 1000, 400),
      op = 200 + index;
    const payload = f.payload({ sourceEventId: source });
    const before = Number(f.db.sql("select count(*) from public.financial_events"));
    const outcomes = await Promise.allSettled([
      f.db.concurrent(as(1, command(op, payload))),
      f.db.concurrent(as(1, cancel(op))),
    ]);
    assert.equal(outcomes[1].status, "fulfilled");
    const result = f.record(read(op));
    assert.deepEqual(f.record(cancel(op)), result);
    if (result.status === "recorded") {
      assert.equal(outcomes[0].status, "fulfilled");
      assert.deepEqual(f.record(command(op, payload)), result.receipt);
      assert.equal(Number(f.db.sql("select count(*) from public.financial_events")), before + 1);
    } else {
      assert.equal(result.status, "cancelled");
      assert.equal(outcomes[0].status, "rejected");
      assert.match(outcomes[0].reason.stderr, /Save cancelled/);
      assert.equal(Number(f.db.sql("select count(*) from public.financial_events")), before);
    }
  }
});
test("cancellation cannot approve or reverse AI corrections and a failed marker remains unresolved", (t) => {
  const f = fixture(t),
    payload = f.payload();
  f.db.sql(
    "alter table public.nest_correction_save_cancellations add constraint fixture_failure check(false) not valid",
  );
  assert.throws(() => f.record(cancel(100)), /fixture_failure/);
  assert.equal(f.record(read(100)).status, "unresolved");
  f.db.sql("alter table public.nest_correction_save_cancellations drop constraint fixture_failure");
  assert.equal(f.record(cancel(100)).status, "cancelled");
  assert.throws(() => f.record(command(100, payload, id(999))), /Not authorized/);
  const approval = approve(f, 100, payload);
  const receipt = f.record(command(100, payload, approval));
  assert.equal(receipt.approvalId, approval);
  assert.throws(() => f.record(cancel(100)), /Not a direct Save/);
  assert.throws(() => f.record(read(100)), /Not a direct Save/);
  assert.deepEqual(f.record(command(100, payload, approval)), receipt);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
});
