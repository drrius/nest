import assert from "node:assert/strict";
import { test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, id } from "./money-expense-helpers.mjs";

const migration = "supabase/migrations/20261004143015_native_legacy_completion_dates.sql";
function fixture(t, apply = true) {
  const db = startFixturePostgres();
  t.after(() => db.stop());
  db.file("tests/database/routine-closure-fixture.sql");
  db.file("supabase/migrations/20260920082522_native_routine_creation.sql");
  if (apply) db.file(migration);
  let sequence = 100;
  const create = () => {
    const routine = JSON.parse(
      db.sql(
        as(
          1,
          `select public.nest_create_routine('${id(10)}','${id(sequence++)}',
      '{"title":"Completion date fixture","schedule":{"kind":"daily"},"assignment":{"policy":"shared"}}')`,
        ),
      ),
    );
    return db.sql(
      `select id from public.routine_occurrences where routine_id='${routine.routineId}' and role='current'`,
    );
  };
  return { db, create };
}
const complete = (occurrence, date, key = "completion-date") =>
  `select public.complete_occurrence('${occurrence}','${key}',${date},null,null)`;
const snapshot = (db) =>
  db.sql(`select jsonb_build_object(
  'routines',(select jsonb_agg(to_jsonb(r) order by id) from public.routines r),
  'occurrences',(select jsonb_agg(to_jsonb(o) order by id) from public.routine_occurrences o),
  'completions',(select jsonb_agg(to_jsonb(c) order by occurrence_id) from public.routine_completions c),
  'receipts',(select jsonb_agg(to_jsonb(r) order by household_id,idempotency_key) from public.routine_command_receipts r),
  'activity',(select jsonb_agg(to_jsonb(a) order by id) from public.activity_events a),
  'notices',(select jsonb_agg(to_jsonb(n) order by id) from public.inbox_notifications n),
  'reminders',(select jsonb_agg(to_jsonb(r) order by id) from public.reminder_candidates r))`);

test("legacy completion refuses future, nonfinite and unsupported civil dates before any write", (t) => {
  const { db, create } = fixture(t),
    occurrence = create();
  const tomorrow = db.sql("select (private.household_today()+1)::text");
  const before = snapshot(db);
  for (const date of [
    `'${tomorrow}'::date`,
    "'infinity'::date",
    "'-infinity'::date",
    "'10000-01-01'::date",
    "'0001-12-31 BC'::date",
    "null",
  ]) {
    assert.throws(() => db.sql(as(1, complete(occurrence, date))), /invalid_completed_date/, date);
    assert.equal(snapshot(db), before, `Rejected ${date} must leave all closure state unchanged`);
  }
});

test("valid civil completion retains attribution, advances once and replays without any changes", (t) => {
  const { db, create } = fixture(t);
  const today = db.sql("select private.household_today()::text");
  for (const [index, date] of ["0001-01-01", "2000-02-29", today].entries()) {
    const occurrence = create(),
      command = complete(occurrence, `'${date}'::date`, `valid-date-${index}`);
    const first = JSON.parse(db.sql(as(2, command))),
      before = snapshot(db);
    assert.equal(first.status, "completed");
    assert.deepEqual(JSON.parse(db.sql(as(2, command))), first);
    assert.equal(snapshot(db), before);
    assert.equal(
      db.sql(
        `select completed_on from public.routine_completions where occurrence_id='${occurrence}'`,
      ),
      date,
    );
    assert.equal(
      db.sql(
        `select completed_by_member_id from public.routine_completions where occurrence_id='${occurrence}'`,
      ),
      id(2),
    );
    assert.equal(
      db.sql(
        `select count(*) from public.routine_occurrences where routine_id='${first.routine_id}' and status='open'`,
      ),
      "2",
    );
  }
});

test("date hardening preserves an already committed legacy future-date receipt and immutable history", (t) => {
  const { db, create } = fixture(t, false),
    occurrence = create();
  const future = db.sql("select (private.household_today()+14)::text");
  const command = complete(occurrence, `'${future}'::date`, "retained-future-date");
  const first = JSON.parse(db.sql(as(1, command))),
    before = snapshot(db);
  db.file(migration);
  assert.deepEqual(JSON.parse(db.sql(as(1, command))), first);
  assert.equal(snapshot(db), before);
  assert.throws(
    () => db.sql(as(1, complete(occurrence, `'${future}'::date`, "new-invalid-date"))),
    /invalid_completed_date/,
  );
  assert.throws(() => db.sql(as(3, command)), /invalid_completed_date|not a member/);
  assert.equal(snapshot(db), before);
});

test("valid completion still enforces tenant membership and anonymous denial", (t) => {
  const { db, create } = fixture(t),
    occurrence = create();
  const date = `'${db.sql("select private.household_today()::text")}'::date`,
    before = snapshot(db);
  assert.throws(() => db.sql(as(3, complete(occurrence, date))), /not a member/);
  assert.throws(() => db.sql(`set role anon; ${complete(occurrence, date)}`), /permission denied/);
  assert.equal(snapshot(db), before);
});
