import assert from "node:assert/strict";
import test from "node:test";
import { fixture, id, as } from "./chore-reminder-fixture.mjs";
test("chore reminders bind reviewed state, replay exact history, and cancellation fences late writes", (t) => {
  const f = fixture(t);
  assert.equal(f.read().reminder, null);
  const first = f.save();
  assert.deepEqual(f.read(id(2)).reminder, first.reminder);
  const second = f.save(
    {
      ...f.input,
      expectedRevision: first.reminder.revision,
      settings: { ...f.settings, enabled: false },
    },
    id(2001),
    id(2),
  );
  assert.notEqual(second.reminder.revision, first.reminder.revision);
  assert.deepEqual(f.save(), first);
  assert.deepEqual(f.recover().receipt, first);
  assert.throws(
    () => f.save({ ...f.input, settings: { ...f.settings, localTime: "10:00" } }),
    /operation changed/,
  );
  assert.throws(() => f.save(f.input, id(2002)), /Reminder changed/);
  assert.equal(f.recover(id(2003)).status, "unresolved");
  assert.equal(f.recover(id(2003), true).status, "cancelled");
  assert.throws(() => f.save(f.input, id(2003)), /abandoned/);
  assert.deepEqual(f.recover(id(2000), true).receipt, first);
  assert.throws(() => f.db.sql("delete from private.nest_chore_reminder_operations"), /immutable/);
});
test("chore reminders enforce tenant membership, strict recipients and inaccessible private history", (t) => {
  const f = fixture(t);
  assert.throws(() => f.read(id(3)), /Not authorized/);
  assert.throws(() => f.save(f.input, id(2000), id(3)), /Not authorized/);
  assert.throws(
    () => f.save({ ...f.input, settings: { ...f.settings, recipientIds: [id(3)] } }),
    /recipient unavailable/,
  );
  assert.throws(
    () => f.save({ ...f.input, settings: { ...f.settings, overrideMute: true } }),
    /Invalid reminder/,
  );
  f.save();
  assert.equal(f.db.sql(as("select count(*) from public.nest_chore_reminders", id(3))), "0");
  assert.throws(
    () => f.db.sql(as("update public.nest_chore_reminders set revision=gen_random_uuid()")),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql(as("select * from private.nest_chore_reminder_operations")),
    /permission denied/,
  );
  assert.throws(
    () =>
      f.db.sql(
        `set role anon; select public.nest_read_chore_reminder('${id(10)}','${f.occurrenceId}')`,
      ),
    /permission denied/,
  );
  f.save({ ...f.input, expectedRevision: f.read().reminder.revision }, id(2001), id(2));
  f.db.sql(`delete from public.household_members where user_id='${id(2)}'`);
  assert.throws(() => f.recover(id(2001), false, id(2)), /Not authorized/);
});
test("rescheduled, reassigned, completed and paused chores invalidate reviewed reminder baselines", (t) => {
  const f = fixture(t);
  f.db.sql(
    `update public.routine_occurrences set due_date=due_date+1 where id='${f.occurrenceId}'`,
  );
  assert.notEqual(f.read().itemRevision, f.input.expectedItemRevision);
  assert.throws(() => f.save(), /Chore changed/);
  const rescheduled = { ...f.input, expectedItemRevision: f.read().itemRevision };
  f.db.sql(
    `update public.routine_occurrences set nest_accepted_assignee_id='${id(2)}' where id='${f.occurrenceId}'`,
  );
  assert.throws(() => f.save(rescheduled), /Chore changed/);
  const current = { ...f.input, expectedItemRevision: f.read().itemRevision };
  const receipt = f.save(current);
  f.db.sql(`update public.routines set paused_at=now() where id='${f.routine.routineId}'`);
  assert.throws(() => f.read(), /Chore changed/);
  assert.throws(
    () => f.save({ ...current, expectedRevision: receipt.reminder.revision }, id(2001)),
    /Chore changed/,
  );
  assert.deepEqual(f.recover().receipt, receipt);
  f.db.sql(`update public.routines set paused_at=null where id='${f.routine.routineId}'`);
  const dueDate = f.read().chore.dueDate;
  f.db.sql(
    as(
      `select public.nest_complete_chore('${f.occurrenceId}','${id(3000)}','${dueDate}',(clock_timestamp() at time zone 'Europe/Zurich')::date)`,
    ),
  );
  assert.throws(() => f.read(), /Chore changed/);
  assert.throws(() => f.save(current, id(2002)), /Chore changed/);
});
