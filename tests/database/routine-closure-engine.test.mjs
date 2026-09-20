import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/routine-closure-fixture.sql");
db.file("supabase/migrations/20260920082522_native_routine_creation.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
let sequence = 100;
function create(schedule = { kind: "daily" }, assignment = { policy: "shared" }) {
  const definition = JSON.stringify({ title: "Closure fixture", schedule, assignment });
  const routine = JSON.parse(
    db.sql(
      as(`select public.nest_create_routine('${id(10)}','${id(sequence++)}','${definition}')`),
    ),
  );
  const current = JSON.parse(
    db.sql(
      `select row_to_json(o) from public.routine_occurrences o where routine_id='${routine.routineId}' and role='current'`,
    ),
  );
  return { routine, current };
}
const rows = (routine) =>
  JSON.parse(
    db.sql(
      `select coalesce(jsonb_agg(to_jsonb(o) order by due_date,id),'[]') from public.routine_occurrences o where routine_id='${routine.routineId}'`,
    ),
  );

test("actual complete and skip advance current/preview exactly once and retain closed history", () => {
  for (const kind of ["complete", "skip"]) {
    const { routine, current } = create();
    const key = `closure-${sequence++}`;
    const command =
      kind === "complete"
        ? `select public.complete_occurrence('${current.id}','${key}',private.household_today(),null,null)`
        : `select public.skip_occurrence('${current.id}','${key}')`;
    // household_today is an internal helper, so bind its value before entering the client role.
    const sql = command.replace(
      "private.household_today()",
      `'${db.sql("select private.household_today()")}'::date`,
    );
    const first = db.sql(as(sql));
    const before = rows(routine);
    assert.equal(db.sql(as(sql)), first);
    assert.deepEqual(rows(routine), before);
    assert.equal(before.filter((row) => row.status === "open").length, 2);
    assert.equal(
      before.find((row) => row.id === current.id).status,
      kind === "complete" ? "completed" : "skipped",
    );
    assert.equal(
      db.sql(`select count(*) from public.routine_command_receipts where idempotency_key='${key}'`),
      "1",
    );
  }
});

test("reschedule preserves identity and original recurrence anchor, updates reminder dates and notifies partner", () => {
  const { routine, current } = create({ kind: "biweekly", weekday: 1 });
  db.sql(`insert into public.routine_reminder_preferences(routine_id,household_id,member_id,enabled)
    values('${routine.routineId}','${id(10)}','${id(2)}',true);
    select private.create_reminder_candidates_for_occurrence('${current.id}')`);
  const nextDate = db.sql(`select ('${current.due_date}'::date+3)::text`);
  const command = `select public.reschedule_occurrence('${current.id}','${nextDate}','move-${sequence++}')`;
  const result = db.sql(as(command));
  const changed = rows(routine).find((row) => row.id === current.id);
  assert.equal(changed.original_due_date, current.original_due_date);
  assert.equal(changed.due_date, nextDate);
  assert.ok(changed.rescheduled_at);
  assert.equal(db.sql(as(command)), result);
  assert.equal(
    db.sql(
      `select count(*) from public.activity_events where entity_id='${current.id}' and kind='occurrence_rescheduled'`,
    ),
    "1",
  );
  assert.equal(
    db.sql(
      `select count(*) from public.inbox_notifications where entity_id='${current.id}' and recipient_member_id='${id(2)}'`,
    ),
    "1",
  );
  assert.equal(
    db.sql(
      `select count(*) from public.reminder_candidates where occurrence_id='${current.id}' and status='pending' and remind_on='${nextDate}'`,
    ),
    "1",
  );
});

test("actual closure denies foreign members and preview changes without partial state", () => {
  const { routine, current } = create();
  const before = rows(routine);
  assert.throws(
    () => db.sql(as(`select public.skip_occurrence('${current.id}','outsider')`, id(3))),
    /not a member/,
  );
  const preview = before.find((row) => row.role === "preview");
  assert.throws(
    () => db.sql(as(`select public.skip_occurrence('${preview.id}','preview')`)),
    /only the current/,
  );
  assert.deepEqual(rows(routine), before);
});
