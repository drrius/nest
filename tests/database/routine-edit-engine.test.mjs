import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/routine-edit-fixture.sql");
db.file("supabase/migrations/20260920082522_native_routine_creation.sql");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql) => `set role authenticated; set request.jwt.claim.sub='${id(1)}'; ${sql}`;
const json = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
let sequence = 100;
const create = (schedule = { kind: "daily" }) =>
  JSON.parse(
    db.sql(
      as(
        `select public.nest_create_routine('${id(10)}','${id(sequence++)}',${json({ title: "Clean", schedule, assignment: { policy: "shared" } })})`,
      ),
    ),
  );
const edit = (routine, key, patch) =>
  JSON.parse(
    db.sql(
      as(
        `select public.edit_routine_definition('${routine.routineId}','${routine.version}','${key}',${json(patch)})`,
      ),
    ),
  );
const occurrences = (routine) =>
  JSON.parse(
    db.sql(
      `select jsonb_agg(to_jsonb(o) order by role) from public.routine_occurrences o where routine_id='${routine.routineId}'`,
    ),
  );
test("actual legacy title edits preserve open occurrence identities and reject stale versions", () => {
  const routine = create(),
    before = occurrences(routine);
  const saved = edit(routine, "title-change", { title: "Revised" });
  assert.deepEqual(occurrences(routine), before);
  assert.deepEqual(edit(routine, "title-change", { title: "Revised" }), saved);
  assert.throws(() => edit(routine, "stale-title", { title: "Stale" }), /changed/);
  assert.equal(
    db.sql(`select title from public.routines where id='${routine.routineId}'`),
    "Revised",
  );
});
test("actual assignment rebuild preserves manual reschedule and recurrence anchor with real partner notice", () => {
  const routine = create();
  db.sql(
    `update public.routine_occurrences set due_date=due_date+3,rescheduled_at='2026-09-20T08:00:00Z' where routine_id='${routine.routineId}' and role='current'`,
  );
  const before = occurrences(routine),
    current = before.find((row) => row.role === "current"),
    preview = before.find((row) => row.role === "preview");
  edit(routine, "assignment-change", { assignment_policy: "assigned", assigned_member_id: id(2) });
  const after = occurrences(routine),
    next = after.find((row) => row.role === "current");
  assert.equal(after.length, 2);
  assert.equal(next.due_date, current.due_date);
  assert.equal(next.original_due_date, current.original_due_date);
  assert.equal(next.rescheduled_at, current.rescheduled_at);
  assert.equal(next.planned_assignee_id, id(2));
  assert.equal(after.find((row) => row.role === "preview").due_date, preview.due_date);
  assert.equal(
    db.sql(
      `select count(*) from public.inbox_notifications where entity_id='${routine.routineId}' and recipient_member_id='${id(2)}'`,
    ),
    "1",
  );
  assert.equal(db.sql("select status from public.push_outbox"), "skipped_no_subscription");
});

test("meal-linked preparation edits keep one durable occurrence and completed dates stay immutable", () => {
  const routine = create({ kind: "one_off", date: "2026-09-22" });
  const meal = id(sequence++);
  db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values('${meal}','${id(10)}','2026-09-22','dinner','Fixture meal'); update public.routine_occurrences set meal_plan_entry_id='${meal}' where routine_id='${routine.routineId}'`,
  );
  const before = occurrences(routine)[0];
  const changed = edit(routine, "meal-date", {
    schedule_rule: { kind: "one_off", date: "2026-09-23" },
  });
  const after = occurrences(routine);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, before.id);
  assert.equal(after[0].meal_plan_entry_id, meal);
  assert.equal(after[0].due_date, "2026-09-23");
  routine.version = changed.updated_at;
  assert.throws(
    () =>
      edit(routine, "meal-recurring", {
        schedule_kind: "calendar",
        schedule_rule: { kind: "daily" },
      }),
    /must remain a one-off/,
  );
  db.sql(
    `update public.routine_occurrences set status='completed',role=null,closed_at=now() where id='${before.id}'`,
  );
  assert.throws(
    () =>
      edit(routine, "finished-date", { schedule_rule: { kind: "one_off", date: "2026-09-24" } }),
    /Finished meal preparation/,
  );
  edit(routine, "finished-title", { title: "Clearer prep title" });
  assert.equal(occurrences(routine)[0].id, before.id);
  assert.equal(occurrences(routine)[0].due_date, "2026-09-23");
});
test("concurrent versioned edits commit only one title and preserve the occurrence window", async () => {
  const routine = create(),
    before = occurrences(routine);
  const results = await Promise.allSettled(
    ["First edit", "Second edit"].map((title, i) =>
      db.concurrent(
        as(
          `select public.edit_routine_definition('${routine.routineId}','${routine.version}','race-${i}',${json({ title })})`,
        ),
      ),
    ),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const failure = results.find((result) => result.status === "rejected");
  assert.match(failure.reason.stderr, /changed|could not obtain lock/);
  assert.deepEqual(occurrences(routine), before);
  assert.equal(
    db.sql(
      `select count(*) from private.routine_edit_receipts where result->>'routine_id'='${routine.routineId}'`,
    ),
    "1",
  );
});
test("version trigger is strictly monotonic for repeated edits within one transaction", () => {
  const routine = create();
  db.sql(
    `begin; do $$ declare first_version timestamptz; second_version timestamptz; begin update public.routines set title='First' where id='${routine.routineId}' returning updated_at into first_version; update public.routines set title='Second' where id='${routine.routineId}' returning updated_at into second_version; if second_version<=first_version then raise exception 'Version did not advance'; end if; end $$; rollback;`,
  );
});
