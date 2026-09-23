import test from "node:test";
import assert from "node:assert/strict";
import { setup, id } from "./grocery-reminder-schedule-fixture.mjs";
test("grocery scheduling resolves Zurich gaps, deduplicates and cancels checked items", async (t) => {
  const f = setup(t);
  assert.equal(f.due(), "2028-03-26 01:30");
  await Promise.all(Array.from({ length: 3 }, () => f.db.concurrent(f.materializeSql)));
  assert.equal(f.db.sql("select count(*) from private.nest_grocery_reminder_outbox"), "2");
  f.db.sql(`update public.grocery_items set native_checked=true where id='${f.itemId}'`);
  assert.equal(f.cancel().cancelled, 2);
  assert.equal(f.materialize().inserted, 0);
});
test("grocery scheduling respects muted recipients and uses standard time for Zurich overlap", (t) => {
  const f = setup(t, "2028-10-29");
  assert.equal(f.due(), "2028-10-29 01:30");
  f.db.sql(
    `update public.nest_notification_preferences set item_reminders_enabled=false where actor_id='${id(2)}'`,
  );
  assert.equal(f.materialize().inserted, 1);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal(f.cancel().cancelled, 1);
});
test("item edits invalidate pending work while sent history is never resurrected", (t) => {
  const f = setup(t);
  f.materialize();
  f.db.sql(
    `update private.nest_grocery_reminder_outbox set state='sent' where recipient_id='${id(1)}'`,
  );
  f.db.sql(`update public.grocery_items set name='Changed' where id='${f.itemId}'`);
  assert.equal(f.cancel().cancelled, 1);
  assert.equal(f.materialize().inserted, 0);
  assert.equal(
    f.db.sql("select count(*) from private.nest_grocery_reminder_outbox where state='sent'"),
    "1",
  );
  for (const role of ["authenticated", "anon", "service_role"])
    assert.throws(() => f.db.sql(`set role ${role}; ${f.materializeSql}`), /permission denied/);
});
test("minimum supported local date retains its UTC instant and materializes normally", (t) => {
  const f = setup(t, "0001-01-01");
  const before = f.read().reminder;
  f.save(
    {
      ...f.input,
      expectedRevision: before.revision,
      settings: { ...f.input.settings, localTime: "00:00" },
    },
    id(2900),
  );
  const due = "private.nest_grocery_reminder_due(g,s)";
  const source = "public.grocery_items g join public.nest_grocery_reminders s on s.item_id=g.id";
  assert.equal(
    f.db.sql(
      `select ${due} = timestamp '0001-01-01 00:00' at time zone 'Europe/Zurich' from ${source}`,
    ),
    "t",
  );
  assert.equal(f.db.sql(`select ${due} < timestamptz '0001-01-01 00:00Z' from ${source}`), "t");
  const result = JSON.parse(
    f.db.sql(
      `select private.nest_materialize_grocery_reminders(${due}-interval '1 hour',${due}+interval '1 hour') from ${source}`,
    ),
  );
  assert.equal(result.inserted, 2);
  assert.equal(
    f.db.sql(
      "select bool_and(private.nest_grocery_reminder_current(o)) from private.nest_grocery_reminder_outbox o",
    ),
    "t",
  );
  assert.equal(f.cancel().cancelled, 0);
});
