import assert from "node:assert/strict";
import { test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, id } from "./money-expense-helpers.mjs";

const migration = "supabase/migrations/20261004151358_native_legacy_reschedule_dates.sql";
function fixture(t, apply = true) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.file("tests/database/routine-closure-fixture.sql");
  db.file("supabase/migrations/20260920082522_native_routine_creation.sql");
  if (apply) db.file(migration);
  const routine = JSON.parse(
    db.sql(
      as(
        1,
        `select public.nest_create_routine('${id(10)}','${id(9900)}',
    '{"title":"Reschedule date fixture","schedule":{"kind":"daily"},"assignment":{"policy":"shared"}}')`,
      ),
    ),
  );
  const occurrence = db.sql(`select id from public.routine_occurrences
    where routine_id='${routine.routineId}' and role='current'`);
  return { db, occurrence };
}
const reschedule = (occurrence, date, key = "reschedule-date") =>
  `select public.reschedule_occurrence('${occurrence}',${date},'${key}')`;
const snapshot = (db) =>
  db.sql(`select jsonb_build_object(
  'occurrences',(select jsonb_agg(to_jsonb(o) order by id) from public.routine_occurrences o),
  'receipts',(select jsonb_agg(to_jsonb(r) order by household_id,idempotency_key) from public.routine_command_receipts r),
  'activity',(select jsonb_agg(to_jsonb(a) order by id) from public.activity_events a),
  'notices',(select jsonb_agg(to_jsonb(n) order by id) from public.inbox_notifications n),
  'reminders',(select jsonb_agg(to_jsonb(r) order by id) from public.reminder_candidates r))`);

test("legacy reschedule rejects nonfinite, unsupported and null dates without altering recurrence", (t) => {
  const { db, occurrence } = fixture(t),
    before = snapshot(db);
  for (const date of [
    "'infinity'::date",
    "'-infinity'::date",
    "'10000-01-01'::date",
    "'0001-12-31 BC'::date",
    "null",
  ]) {
    assert.throws(
      () => db.sql(as(1, reschedule(occurrence, date))),
      /invalid_reschedule_date/,
      date,
    );
    assert.equal(snapshot(db), before);
  }
});

test("finite reschedule retains original recurrence anchor, allows future dates and replays once", (t) => {
  const { db, occurrence } = fixture(t);
  const original = db.sql(
    `select original_due_date from public.routine_occurrences where id='${occurrence}'`,
  );
  for (const [index, date] of ["0001-01-01", "2000-02-29", "2030-01-07", "9999-12-31"].entries()) {
    const command = reschedule(occurrence, `'${date}'::date`, `valid-reschedule-${index}`);
    const first = db.sql(as(2, command)),
      before = snapshot(db);
    assert.equal(db.sql(as(2, command)), first);
    assert.equal(snapshot(db), before);
    assert.equal(
      db.sql(`select due_date from public.routine_occurrences where id='${occurrence}'`),
      date,
    );
    assert.equal(
      db.sql(`select original_due_date from public.routine_occurrences where id='${occurrence}'`),
      original,
    );
    assert.equal(
      db.sql(`select count(*) from public.routine_occurrences where status='open'`),
      "2",
    );
    assert.equal(db.sql(`select count(*) from public.routine_completions`), "0");
  }
});

test("retained infinite reschedule reply remains replayable without rewriting legacy state", (t) => {
  const { db, occurrence } = fixture(t, false);
  const command = reschedule(occurrence, "'infinity'::date", "retained-infinite-reschedule");
  const first = db.sql(as(1, command)),
    before = snapshot(db);
  db.file(migration);
  assert.equal(db.sql(as(1, command)), first);
  assert.equal(snapshot(db), before);
  assert.throws(
    () => db.sql(as(1, reschedule(occurrence, "'infinity'::date", "new-infinite-command"))),
    /invalid_reschedule_date/,
  );
  assert.throws(() => db.sql(as(3, command)), /invalid_reschedule_date|not a member/);
  assert.equal(snapshot(db), before);
});

test("finite reschedule remains tenant bound and anonymous callers cannot execute it", (t) => {
  const { db, occurrence } = fixture(t),
    before = snapshot(db);
  const command = reschedule(occurrence, "'2030-01-07'::date");
  assert.throws(() => db.sql(as(3, command)), /not a member/);
  assert.throws(() => db.sql(`set role anon; ${command}`), /permission denied/);
  assert.equal(snapshot(db), before);
});
