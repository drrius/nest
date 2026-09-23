import test from "node:test";
import assert from "node:assert/strict";
import { setup, id, as } from "./meal-reminder-schedule-fixture.mjs";
test("meal reminders resolve Zurich DST and deduplicate concurrent materialization", async (t) => {
  const f = setup(t);
  assert.equal(f.due(), "2028-03-26 01:30");
  await Promise.all(Array.from({ length: 4 }, () => f.db.concurrent(f.materializeSql)));
  assert.equal(f.db.sql("select count(*) from private.nest_meal_reminder_outbox"), "2");
  assert.equal(f.materialize().inserted, 0);
  assert.throws(() => f.db.sql(as(f.materializeSql)), /permission denied/);
  assert.throws(
    () => f.db.sql(as("select * from private.nest_meal_reminder_outbox")),
    /permission denied/,
  );
  const autumn = setup(t, "2028-10-29");
  assert.equal(autumn.due(), "2028-10-29 01:30");
});
test("meal edits invalidate scheduling until explicitly reviewed; removal cancels pending reminders", (t) => {
  const f = setup(t);
  f.materialize();
  f.db.sql(
    `update public.meal_plan_entries set title_snapshot='Changed meal' where id='${f.entryId}'`,
  );
  assert.equal(f.cancel().cancelled, 2);
  assert.equal(f.materialize().inserted, 0);
  const context = f.read();
  f.save(
    {
      ...f.input,
      expectedItemRevision: context.itemRevision,
      expectedRevision: context.reminder.revision,
    },
    id(2001),
  );
  assert.equal(f.materialize().inserted, 2);
  f.db.sql(`update public.meal_plan_entries set removed_at=now() where id='${f.entryId}'`);
  assert.equal(f.cancel().cancelled, 2);
  assert.equal(f.materialize().inserted, 0);
});
test("recipient mute and membership override saved meal reminder selections", (t) => {
  const f = setup(t);
  f.db.sql(
    `update public.nest_notification_preferences set item_reminders_enabled=false where actor_id='${id(2)}'`,
  );
  assert.equal(f.materialize().inserted, 1);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal(f.cancel().cancelled, 1);
  assert.equal(f.materialize().inserted, 0);
});
test("unmuting restores only cancelled unsent identities and never resends sent reminders", (t) => {
  const f = setup(t);
  f.materialize();
  f.db.sql(
    `update private.nest_meal_reminder_outbox set state='sent' where recipient_id='${id(1)}'`,
  );
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
  assert.equal(f.cancel().cancelled, 1);
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=true");
  assert.equal(f.materialize().inserted, 1);
  assert.equal(f.materialize().inserted, 0);
  assert.equal(
    f.db.sql("select count(*) from private.nest_meal_reminder_outbox where state='sent'"),
    "1",
  );
  assert.equal(
    f.db.sql("select count(*) from private.nest_meal_reminder_outbox where state='pending'"),
    "1",
  );
});
