import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, as } from "./meal-reminder-fixture.mjs";
import { createRequire } from "node:module";
import {
  MealReminderContext,
  MealReminderReceipt,
  MealReminderRecovery,
} from "../../packages/contracts/src/meal-reminders.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
test("meal reminder saves and historical recovery bind complete intent without altering meal state", (t) => {
  const f = fixture(t),
    before = f.db.sql("select row_to_json(m) from public.meal_plan_entries m order by id");
  decode(MealReminderContext, f.read());
  const saved = decode(MealReminderReceipt, f.save());
  assert.deepEqual(f.save(), saved);
  assert.deepEqual(decode(MealReminderRecovery, f.recover()).receipt, saved);
  assert.equal(
    f.db.sql("select row_to_json(m) from public.meal_plan_entries m order by id"),
    before,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_meal_week_revisions"), "0");
  assert.throws(
    () => f.save({ ...f.input, settings: { ...f.input.settings, localTime: "10:00" } }),
    /operation changed/,
  );
  assert.throws(() => f.save(f.input, id(2001)), /Reminder changed/);
  assert.deepEqual(f.recover(id(2000), true).receipt, saved);
});
test("meal reminder mutation and history enforce household membership and RLS", (t) => {
  const f = fixture(t);
  assert.throws(() => f.read(id(101)), /unavailable/);
  assert.throws(() => f.save(f.input, id(2000), id(3)), /Not authorized/);
  assert.throws(
    () => f.save({ ...f.input, settings: { ...f.input.settings, recipientIds: [id(3)] } }),
    /recipient unavailable/,
  );
  f.save(f.input, id(2000), id(2));
  assert.equal(f.db.sql(as("select count(*) from public.nest_meal_reminders", id(3))), "0");
  assert.throws(
    () => f.db.sql(as("update public.nest_meal_reminders set revision=gen_random_uuid()")),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql(as("select * from private.nest_meal_reminder_operations")),
    /permission denied/,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  assert.throws(() => f.recover(id(2000), false, id(2)), /Not authorized/);
});
test("moving, replacing and removing a meal invalidates old settings baselines while history survives", (t) => {
  const f = fixture(t),
    saved = f.save();
  f.db.sql(
    `update public.meal_plan_entries set date=date+1,title_snapshot='Replacement' where id='${id(100)}'`,
  );
  const context = f.read();
  assert.notEqual(context.itemRevision, f.input.expectedItemRevision);
  assert.equal(context.reminder.reviewedItemRevision, f.input.expectedItemRevision);
  assert.throws(
    () => f.save({ ...f.input, expectedRevision: saved.reminder.revision }, id(2001)),
    /Meal changed/,
  );
  f.db.sql(`update public.meal_plan_entries set removed_at=now() where id='${id(100)}'`);
  assert.throws(() => f.read(), /Meal changed/);
  assert.deepEqual(f.recover().receipt, saved);
  assert.equal(f.recover(id(2002), true).status, "cancelled");
  assert.throws(() => f.save(f.input, id(2002)), /abandoned/);
});
test("concurrent meal reminder retries commit once and journal failures roll back settings", async (t) => {
  const f = fixture(t);
  const rows = await Promise.all(Array.from({ length: 4 }, () => f.db.concurrent(as(f.saveSql()))));
  for (const row of rows) assert.deepEqual(JSON.parse(row.stdout), JSON.parse(rows[0].stdout));
  assert.equal(f.db.sql("select count(*) from private.nest_meal_reminder_operations"), "1");
  const before = f.read().reminder;
  f.db.sql(
    `alter table private.nest_meal_reminder_operations add constraint reject_next check(operation_id<>'${id(2001)}')`,
  );
  assert.throws(
    () => f.save({ ...f.input, expectedRevision: before.revision }, id(2001)),
    /reject_next/,
  );
  assert.deepEqual(f.read().reminder, before);
});
test("legacy nonfinite dates, extra authority and disabled-recipient ambiguity fail closed", (t) => {
  const f = fixture(t);
  assert.throws(() => f.read(id(106)), /Meal changed/);
  assert.throws(() => f.save({ ...f.input, householdId: id(20) }), /Invalid meal reminder command/);
  assert.throws(
    () => f.save({ ...f.input, settings: { ...f.input.settings, overrideMute: true } }),
    /Invalid reminder/,
  );
  assert.throws(
    () => f.save({ ...f.input, settings: { ...f.input.settings, recipientIds: [] } }),
    /Invalid reminder/,
  );
});
test("distinct concurrent reminder edits cannot overwrite the same reviewed revision", async (t) => {
  const f = fixture(t);
  const outcomes = await Promise.allSettled(
    [2000, 2001].map((operation) => f.db.concurrent(as(f.saveSql(f.input, id(operation))))),
  );
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  assert.match(String(rejected.reason), /Reminder changed/);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_reminder_operations"), "1");
});
test("meal reminders reject advance dates outside the supported civil calendar", (t) => {
  const f = fixture(t);
  f.db.sql(`update public.meal_plan_entries set date='0001-01-01' where id='${id(100)}'`);
  const input = {
    ...f.input,
    expectedItemRevision: f.read().itemRevision,
    settings: { ...f.input.settings, daysBefore: 1 },
  };
  assert.throws(() => f.save(input), /Unsupported reminder date/);
  assert.equal(f.db.sql("select count(*) from public.nest_meal_reminders"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_meal_reminder_operations"), "0");
});
