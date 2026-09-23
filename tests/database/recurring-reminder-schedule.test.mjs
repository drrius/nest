import test from "node:test";
import assert from "node:assert/strict";
import { setup, id } from "./recurring-reminder-schedule-fixture.mjs";
test("recurring reminders resolve Zurich DST, deduplicate and invalidate completed cycles", (t) => {
  const f = setup(t);
  assert.equal(f.due(), "2028-03-26 01:30");
  assert.equal(f.materialize().inserted, 2);
  assert.equal(f.materialize().inserted, 0);
  f.db.sql(
    "update private.nest_recurring_execution set covered_through=next_due_on,next_due_on=next_due_on+31",
  );
  assert.equal(f.cancel().cancelled, 2);
  assert.equal(f.materialize().inserted, 0);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
});
test("recipient mute, membership and rule revision gate recurring scheduling", (t) => {
  const f = setup(t, "2028-10-29");
  assert.equal(f.due(), "2028-10-29 01:30");
  f.db.sql(
    `update public.nest_notification_preferences set item_reminders_enabled=false where actor_id='${id(2)}'`,
  );
  assert.equal(f.materialize().inserted, 1);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal(f.cancel().cancelled, 1);
  f.db.sql("update public.nest_recurring_rules set revision=gen_random_uuid()");
  assert.equal(f.due(), "");
  assert.equal(f.materialize().inserted, 0);
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_recurring_reminder_outbox`),
      /permission denied/,
    );
});
test("unchanged reminder settings follow the next uncovered cycle and preserve sent history", (t) => {
  const f = setup(t);
  f.materialize();
  f.db.sql("update private.nest_recurring_reminder_outbox set state='sent'");
  f.db.sql(
    "update private.nest_recurring_execution set covered_through=next_due_on,next_due_on='2028-04-26'",
  );
  const next = () =>
    JSON.parse(
      f.db.sql(
        "select private.nest_materialize_recurring_reminders('2028-04-26 00:00Z','2028-04-27 00:00Z')",
      ),
    );
  assert.equal(next().inserted, 2);
  assert.equal(next().inserted, 0);
  assert.equal(
    f.db.sql("select count(*) from private.nest_recurring_reminder_outbox where state='sent'"),
    "2",
  );
  f.db.sql("update public.nest_recurring_rules set status='paused'");
  assert.equal(f.cancel().cancelled, 2);
  assert.equal(next().inserted, 0);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
});
test("disabled reminders and date underflow never materialize and windows are bounded", (t) => {
  const f = setup(t);
  f.db.sql(
    "update public.nest_recurring_reminders set settings=jsonb_set(settings,'{enabled}','false')",
  );
  assert.equal(f.materialize().inserted, 0);
  f.db.sql(
    "update public.nest_recurring_rules set configuration=jsonb_set(configuration,'{startDate}','\"0001-01-01\"')",
  );
  f.db.sql("update private.nest_recurring_execution set next_due_on='0001-01-01'");
  f.db.sql(
    "update public.nest_recurring_reminders set settings=jsonb_set(jsonb_set(settings,'{enabled}','true'),'{daysBefore}','1')",
  );
  assert.equal(f.due(), "");
  assert.throws(
    () =>
      f.db.sql("select private.nest_materialize_recurring_reminders('2028-03-26','2028-03-28')"),
    /Invalid reminder window/,
  );
});
