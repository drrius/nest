import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of [
  "tests/database/routine-edit-fixture.sql",
  "tests/database/legacy-routine-edits/lifecycle.sql",
  "supabase/migrations/20260920082522_native_routine_creation.sql",
])
  db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
let operation = 500;
const create = () =>
  JSON.parse(
    db.sql(
      as(
        `select public.nest_create_routine('${id(10)}','${id(operation++)}', '{"title":"Clean","schedule":{"kind":"daily"},"assignment":{"policy":"shared"}}')`,
      ),
    ),
  );
const state = (routine, fn, actor) =>
  db.sql(as(`select public.${fn}('${routine.routineId}')`, actor));
const occurrences = (r) =>
  db.sql(
    `select jsonb_agg(to_jsonb(o) order by id) from public.routine_occurrences o where routine_id='${r.routineId}'`,
  );

test("audited pause/resume keeps occurrence identity and changes only opted-in reminder candidates", () => {
  const r = create(),
    before = occurrences(r);
  db.sql(`insert into public.routine_reminder_preferences(routine_id,household_id,member_id,enabled) values('${r.routineId}','${id(10)}','${id(1)}',true);
    select private.create_reminder_candidates_for_occurrence(id) from public.routine_occurrences where routine_id='${r.routineId}'`);
  state(r, "pause_routine");
  assert.equal(occurrences(r), before);
  assert.equal(
    db.sql(`select count(*) from public.reminder_candidates where status='pending'`),
    "0",
  );
  state(r, "pause_routine");
  assert.equal(
    db.sql(
      `select count(*) from public.activity_events where entity_id='${r.routineId}' and kind='routine_paused'`,
    ),
    "1",
  );
  state(r, "unpause_routine");
  assert.equal(occurrences(r), before);
  assert.equal(
    db.sql(`select count(*) from public.reminder_candidates where status='pending'`),
    "2",
  );
  assert.equal(
    db.sql(
      `select count(*) from public.routine_reminder_preferences where routine_id='${r.routineId}'`,
    ),
    "1",
  );
});

test("audited archival preserves current occurrence and history, removes preview and rejects resume", () => {
  const r = create();
  const current = db.sql(
    `select id from public.routine_occurrences where routine_id='${r.routineId}' and role='current'`,
  );
  // Seed retained history without claiming to exercise the separate closure engine.
  db.sql(`insert into public.routine_occurrences(household_id,routine_id,due_date,original_due_date,status,closed_at)
    values('${id(10)}','${r.routineId}','2026-01-01','2026-01-01','skipped','2026-01-01T12:00:00Z')`);
  const history = db.sql(
    `select to_jsonb(o) from public.routine_occurrences o where routine_id='${r.routineId}' and status='skipped'`,
  );
  assert.throws(() => state(r, "archive_routine", id(3)), /not a household member/);
  state(r, "archive_routine");
  state(r, "archive_routine");
  assert.equal(
    db.sql(
      `select id from public.routine_occurrences where routine_id='${r.routineId}' and status='open'`,
    ),
    current,
  );
  assert.equal(
    db.sql(
      `select count(*) from public.activity_events where entity_id='${r.routineId}' and kind='routine_archived'`,
    ),
    "1",
  );
  assert.equal(
    db.sql(
      `select to_jsonb(o) from public.routine_occurrences o where routine_id='${r.routineId}' and status='skipped'`,
    ),
    history,
  );
  assert.throws(() => state(r, "unpause_routine"), /archived routines/);
  assert.throws(() => state(r, "pause_routine"), /archived routines/);
});
