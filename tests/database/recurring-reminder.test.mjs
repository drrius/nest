import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, id, as } from "./recurring-reminder-fixture.mjs";
import {
  RecurringReminderReceipt,
  RecurringReminderContext,
} from "../../packages/contracts/src/recurring-reminders.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
test("recurring reminder saves exact terms, preserves financial state and recovers historical receipt", (t) => {
  const f = fixture(t);
  const before = f.db.sql("select row_to_json(r) from public.nest_recurring_rules r");
  const saved = f.save();
  assert.ok(Schema.is(RecurringReminderReceipt)(saved));
  const context = JSON.parse(
    f.db.sql(as(1, `select public.nest_read_recurring_reminder('${id(10)}','${f.input.ruleId}')`)),
  );
  assert.ok(Schema.is(RecurringReminderContext)(context));
  assert.deepEqual(f.save(), saved);
  assert.deepEqual(f.recover().receipt, saved);
  assert.equal(f.db.sql("select row_to_json(r) from public.nest_recurring_rules r"), before);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
  f.db.sql(`update private.nest_recurring_execution set next_due_on=next_due_on+1`);
  assert.deepEqual(f.save(), saved);
  assert.throws(
    () => f.save({ ...f.input, expectedRevision: saved.reminder.revision }, id(2001)),
    /Recurring changed/,
  );
});
test("recurring reminder cancellation fences late writes and authorization precedes replay", (t) => {
  const f = fixture(t);
  assert.equal(f.recover(id(2001), true).status, "cancelled");
  assert.throws(() => f.save(f.input, id(2001)), /abandoned/);
  f.save();
  assert.throws(
    () => f.save({ ...f.input, settings: { ...f.input.settings, daysBefore: 1 } }),
    /operation changed/,
  );
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.save(), /Not authorized/);
  assert.throws(() => f.recover(), /Not authorized/);
});
test("recurring reminder enforces tenant isolation, recipient membership and immutable history", (t) => {
  const f = fixture(t);
  assert.throws(
    () => f.save({ ...f.input, settings: { ...f.input.settings, recipientIds: [id(3)] } }),
    /recipient unavailable/,
  );
  f.save();
  assert.equal(f.db.sql(as(3, "select count(*) from public.nest_recurring_reminders")), "0");
  assert.throws(() => f.save(f.input, id(2002), 3), /Not authorized/);
  assert.throws(
    () => f.db.sql(as(1, "delete from public.nest_recurring_reminders")),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql(as(1, "select * from private.nest_recurring_reminder_operations")),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql("delete from private.nest_recurring_reminder_operations"),
    /immutable/,
  );
});
test("recurring reminder concurrent retries are exact and revision competitors have one winner", async (t) => {
  const f = fixture(t);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(1, f.saveSql()))),
  );
  const saved = JSON.parse(results[0].stdout);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  const input = { ...f.input, expectedRevision: saved.reminder.revision };
  const outcomes = await Promise.allSettled(
    [2001, 2002].map((n) => f.db.concurrent(as(1, f.saveSql(input, id(n))))),
  );
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(String(outcomes.find((r) => r.status === "rejected").reason), /Reminder changed/);
  assert.equal(f.db.sql("select count(*) from private.nest_recurring_reminder_operations"), "2");
});
test("recurring reminder receipt failure rolls back settings and malformed dates are rejected", (t) => {
  const f = fixture(t),
    saved = f.save();
  for (const expectedDueOn of ["2026-02-30", "0000-01-01", "2026-09-23\n", null, 1])
    assert.throws(() => f.save({ ...f.input, expectedDueOn }, id(2001)), /Invalid/);
  f.db.sql(
    `alter table private.nest_recurring_reminder_operations add constraint reject_next check(operation_id<>'${id(2001)}')`,
  );
  assert.throws(
    () =>
      f.save(
        {
          ...f.input,
          expectedRevision: saved.reminder.revision,
          settings: { ...f.input.settings, enabled: false },
        },
        id(2001),
      ),
    /reject_next/,
  );
  assert.equal(
    f.db.sql("select revision from public.nest_recurring_reminders"),
    saved.reminder.revision,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
});
