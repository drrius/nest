import test from "node:test";
import { createRequire } from "node:module";
import {
  GroceryReminderContext,
  GroceryReminderReceipt,
  GroceryReminderRecovery,
} from "../../packages/contracts/src/grocery-reminders.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
import assert from "node:assert/strict";
import { fixture, id, as } from "./grocery-reminder-fixture.mjs";
test("grocery reminder receipt survives checking; stale writes and cancelled late sends fail", (t) => {
  const f = fixture(t);
  decode(GroceryReminderContext, f.read());
  const receipt = decode(GroceryReminderReceipt, f.save());
  assert.equal(receipt.reminder.reviewedItemVersion, "1");
  f.db.sql(
    as(`select public.nest_set_grocery_checked('${id(10)}','${id(3000)}','${id(500)}',1,true)`),
  );
  assert.deepEqual(f.save(), receipt);
  assert.deepEqual(decode(GroceryReminderRecovery, f.recover()).receipt, receipt);
  assert.throws(() => f.save(f.input, id(2001)), /Grocery changed/);
  assert.equal(f.recover(id(2002), true).status, "cancelled");
  assert.throws(() => f.save(f.input, id(2002)), /abandoned/);
  assert.throws(() => f.recover(id(2000), false, id(3)), /Not authorized/);
});
test("grocery reminder versions reject malformed strings before casts and enforce tenant access", (t) => {
  const f = fixture(t);
  for (const expectedItemVersion of ["abc", "1\n", "0", "01", "9223372036854775808", 1, null])
    assert.throws(() => f.save({ ...f.input, expectedItemVersion }), /Invalid grocery version/);
  assert.throws(
    () => f.save({ ...f.input, settings: { ...f.input.settings, recipientIds: [id(3)] } }),
    /recipient unavailable/,
  );
  f.save();
  assert.equal(f.db.sql(as("select count(*) from public.nest_grocery_reminders", id(3))), "0");
  assert.throws(
    () => f.db.sql(as("delete from public.nest_grocery_reminders")),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql("delete from private.nest_grocery_reminder_operations"),
    /immutable/,
  );
});
test("concurrent retries commit once and distinct edits cannot replace the same revision", async (t) => {
  const f = fixture(t);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(f.saveSql()))),
  );
  const saved = JSON.parse(results[0].stdout);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  const input = { ...f.input, expectedRevision: saved.reminder.revision };
  const outcomes = await Promise.allSettled(
    [2001, 2002].map((n) => f.db.concurrent(as(f.saveSql(input, id(n))))),
  );
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(String(outcomes.find((r) => r.status === "rejected").reason), /Reminder changed/);
  assert.equal(f.db.sql("select count(*) from private.nest_grocery_reminder_operations"), "2");
});
test("receipt failure rolls back settings and revoked members cannot replay history", (t) => {
  const f = fixture(t),
    saved = f.save();
  const before = f.db.sql("select row_to_json(g) from public.grocery_items g");
  f.db.sql(
    `alter table private.nest_grocery_reminder_operations add constraint reject_next check(operation_id<>'${id(2001)}')`,
  );
  assert.throws(
    () => f.save({ ...f.input, expectedRevision: saved.reminder.revision }, id(2001)),
    /reject_next/,
  );
  assert.deepEqual(f.read().reminder, saved.reminder);
  assert.equal(f.db.sql("select row_to_json(g) from public.grocery_items g"), before);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.save(), /Not authorized/);
  assert.throws(() => f.recover(), /Not authorized/);
  assert.throws(() => f.read(), /Not authorized/);
});
