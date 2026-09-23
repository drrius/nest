import test from "node:test";
import assert from "node:assert/strict";
import { setup, as, id } from "./chore-reminder-schedule-fixture.mjs";
test("chore reminders resolve Zurich DST once and concurrent sweeps deduplicate each recipient", async (t) => {
  const f = setup(t);
  assert.equal(f.due(), "2028-03-26 01:30");
  const rows = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(f.materializeSql)),
  );
  assert.equal(
    rows.reduce((sum, row) => sum + JSON.parse(row.stdout).inserted, 0),
    2,
  );
  assert.equal(f.db.sql("select count(*) from private.nest_chore_reminder_outbox"), "2");
  assert.equal(f.materialize().inserted, 0);
  assert.throws(() => f.db.sql(as(f.materializeSql)), /permission denied/);
  assert.throws(
    () => f.db.sql("set role service_role; select * from private.nest_chore_reminder_outbox"),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql("select private.nest_materialize_chore_reminders('2028-03-01','2028-03-03')"),
    /Invalid reminder window/,
  );
});
test("recipient mute cancels unsent rows and unmute restores the same identity without replaying sent rows", (t) => {
  const f = setup(t);
  f.materialize();
  f.db.sql(
    `update public.nest_notification_preferences set item_reminders_enabled=false where actor_id='${id(2)}'`,
  );
  assert.equal(f.cancel().cancelled, 1);
  assert.equal(f.materialize().inserted, 0);
  f.db.sql(
    `update public.nest_notification_preferences set item_reminders_enabled=true where actor_id='${id(2)}'`,
  );
  assert.equal(f.materialize().inserted, 1);
  f.db.sql("update private.nest_chore_reminder_outbox set state='sent'");
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=false");
  assert.equal(f.cancel().cancelled, 0);
  f.db.sql("update public.nest_notification_preferences set item_reminders_enabled=true");
  assert.equal(f.materialize().inserted, 0);
});
test("changed occurrence invalidates pending reminders until settings explicitly review its new baseline", (t) => {
  const f = setup(t);
  f.materialize();
  f.db.sql(
    `update public.routine_occurrences set nest_accepted_assignee_id='${id(2)}' where id='${f.occurrenceId}'`,
  );
  assert.equal(f.due(), "");
  assert.equal(f.cancel().cancelled, 2);
  assert.equal(f.materialize().inserted, 0);
  f.save(
    {
      ...f.input,
      expectedItemRevision: f.read().itemRevision,
      expectedRevision: f.read().reminder.revision,
    },
    id(2001),
  );
  assert.equal(f.materialize().inserted, 2);
  assert.equal(
    f.db.sql("select count(*) from private.nest_chore_reminder_outbox where state='pending'"),
    "2",
  );
  assert.equal(
    f.db.sql("select count(*) from private.nest_chore_reminder_outbox where state='cancelled'"),
    "2",
  );
});
test("pause, completion and deleted occurrences cannot remain eligible or move settings to future repeats", (t) => {
  const f = setup(t);
  f.materialize();
  f.db.sql(`update public.routines set paused_at=now() where id='${f.routine.routineId}'`);
  assert.equal(f.due(), "");
  assert.equal(f.cancel().cancelled, 2);
  f.db.sql(`update public.routines set paused_at=null where id='${f.routine.routineId}'`);
  f.db.sql(
    as(
      `select public.nest_complete_chore('${f.occurrenceId}','${id(4000)}','2028-03-26',(clock_timestamp() at time zone 'Europe/Zurich')::date)`,
    ),
  );
  assert.equal(f.due(), "");
  assert.equal(f.materialize().inserted, 0);
  assert.equal(f.db.sql("select count(*) from public.nest_chore_reminders"), "1");
});
test("fall overlap and lead dates use civil Zurich time and missing consent never schedules", (t) => {
  const f = setup(t, "2028-10-29");
  assert.equal(f.due(), "2028-10-29 01:30");
  f.save(
    {
      ...f.input,
      expectedRevision: f.read().reminder.revision,
      settings: { ...f.input.settings, daysBefore: 1 },
    },
    id(2001),
  );
  assert.equal(f.due(), "2028-10-28 00:30");
  f.db.sql("delete from public.nest_notification_preferences");
  assert.equal(
    f.db.sql(
      `select count(*) from private.nest_chore_reminder_candidates('2028-10-28','2028-10-29','${id(10)}','${f.occurrenceId}')`,
    ),
    "0",
  );
});

test("deleted chore rows cancel retained pending reminders without attaching to replacements", (t) => {
  const f = setup(t);
  f.materialize();
  f.db.sql(`delete from public.routine_occurrences where id='${f.occurrenceId}'`);
  assert.equal(f.cancel().cancelled, 2);
  assert.equal(f.materialize().inserted, 0);
});
