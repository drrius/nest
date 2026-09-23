import assert from "node:assert/strict";
import test from "node:test";
import { fixture, id, as } from "./chore-reminder-fixture.mjs";
test("simultaneous exact reminder retries converge while competing reviewed saves conflict", async (t) => {
  const f = fixture(t);
  const replies = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(f.saveSql()))),
  );
  const results = replies.map(({ stdout }) => JSON.parse(stdout));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(f.db.sql("select count(*) from private.nest_chore_reminder_operations"), "1");
  const input = { ...f.input, expectedRevision: results[0].reminder.revision };
  const competing = await Promise.allSettled([
    f.db.concurrent(
      as(f.saveSql({ ...input, settings: { ...f.settings, localTime: "10:00" } }, id(2001))),
    ),
    f.db.concurrent(
      as(f.saveSql({ ...input, settings: { ...f.settings, localTime: "11:00" } }, id(2002)), id(2)),
    ),
  ]);
  assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
  const failed = competing.find((result) => result.status === "rejected");
  assert.match(failed.reason.stderr, /Reminder changed/);
  assert.equal(f.db.sql("select count(*) from private.nest_chore_reminder_operations"), "2");
});
test("receipt failure rolls back settings and cancellation/save races have one immutable outcome", async (t) => {
  const f = fixture(t);
  f.db
    .sql(`create function private.fail_chore_receipt() returns trigger language plpgsql as $$ begin raise exception 'synthetic receipt failure'; end; $$;
    create trigger fail_chore_receipt before insert on private.nest_chore_reminder_operations for each row execute function private.fail_chore_receipt()`);
  assert.throws(() => f.save(), /synthetic receipt failure/);
  assert.equal(f.read().reminder, null);
  assert.equal(f.recover().status, "unresolved");
  f.db.sql("drop trigger fail_chore_receipt on private.nest_chore_reminder_operations");
  const results = await Promise.allSettled([
    f.db.concurrent(as(f.saveSql())),
    f.db.concurrent(
      as(`select public.nest_cancel_chore_reminder_operation('${id(10)}','${id(2000)}')`),
    ),
  ]);
  const outcome = f.recover();
  assert.ok(["recorded", "cancelled"].includes(outcome.status));
  if (outcome.status === "recorded") {
    assert.equal(results[0].status, "fulfilled");
    assert.deepEqual(f.save(), outcome.receipt);
  } else {
    assert.equal(f.read().reminder, null);
    assert.throws(() => f.save(), /abandoned/);
  }
  assert.equal(f.db.sql("select count(*) from private.nest_chore_reminder_operations"), "1");
});
