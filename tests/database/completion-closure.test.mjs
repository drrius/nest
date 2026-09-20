import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { completionClosureFiles } from "./completion-closure-files.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of completionClosureFiles) db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
let sequence = 100;
function create() {
  const definition = JSON.stringify({
    title: "Real closure",
    schedule: { kind: "daily" },
    assignment: { policy: "shared" },
  });
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
const command = (current, op) =>
  `select public.nest_complete_chore('${current.id}','${op}','${current.due_date}','${current.due_date}')`;
const state = (routine, action) =>
  db.sql(
    as(
      `select public.nest_set_routine_state('${id(10)}','${id(sequence++)}','${routine.routineId}','${routine.version}','${action}')`,
    ),
  );
const counts = (routine) =>
  db.sql(
    `select count(*) filter(where status='completed')||':'||count(*) filter(where status='open') from public.routine_occurrences where routine_id='${routine.routineId}'`,
  );

test("archive and pause reject queued completion without changing retained history or creating a receipt", () => {
  for (const action of ["archive", "pause"]) {
    const { routine, current } = create();
    state(routine, action);
    const before = counts(routine),
      op = id(sequence++);
    assert.throws(() => db.sql(as(command(current, op))), /occurrence_conflict/);
    assert.equal(counts(routine), before);
    assert.equal(
      db.sql(`select count(*) from public.nest_chore_receipts where operation_id='${op}'`),
      "0",
    );
  }
});

test("real completion returns immutable replay after archival and coalesces concurrent partner completion", async () => {
  const { routine, current } = create(),
    op = id(sequence++);
  const calls = await Promise.all([
    db.concurrent(as(command(current, op))),
    db.concurrent(as(command(current, id(sequence++)), id(2))),
  ]);
  const results = calls.map((call) => JSON.parse(call.stdout));
  assert.deepEqual(results.map((r) => r.outcome).sort(), ["already_completed", "completed"]);
  assert.equal(results[0].completedBy, results[1].completedBy);
  assert.equal(counts(routine), "1:2");
  state(routine, "archive");
  assert.deepEqual(JSON.parse(db.sql(as(command(current, op)))), results[0]);
  assert.equal(counts(routine), "1:1");
});

test("reschedule, skip and definition replacement reject stale completion instead of completing a successor", () => {
  for (const action of ["reschedule", "skip", "edit"]) {
    const { routine, current } = create();
    if (action === "reschedule")
      db.sql(
        as(
          `select public.reschedule_occurrence('${current.id}','${current.due_date}'::date+1,'reschedule-${sequence++}')`,
        ),
      );
    else if (action === "skip")
      db.sql(as(`select public.skip_occurrence('${current.id}','skip-${sequence++}')`));
    else
      db.sql(
        as(
          `select public.nest_edit_routine('${id(10)}','${id(sequence++)}','${routine.routineId}','${routine.version}','{"schedule":{"kind":"weekly","weekday":3}}')`,
        ),
      );
    const before = counts(routine);
    assert.throws(
      () => db.sql(as(command(current, id(sequence++)))),
      /occurrence_conflict|not_found/,
    );
    assert.equal(counts(routine), before);
  }
});

test("native completion and reschedule races select one winner with no successor substitution", async () => {
  for (let index = 0; index < 12; index++) {
    const { routine, current } = create();
    const results = await Promise.allSettled([
      db.concurrent(as(command(current, id(sequence++)))),
      db.concurrent(
        as(
          `select public.reschedule_occurrence('${current.id}','${current.due_date}'::date+1,'race-${sequence++}')`,
          id(2),
        ),
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const error = results.find((r) => r.status === "rejected").reason;
    assert.match(String(error), /occurrence_conflict|not open/);
    assert.doesNotMatch(String(error), /deadlock/);
    assert.ok(["0:2", "1:2"].includes(counts(routine)));
  }
});

test("failed native receipt insertion rolls back actual completion, succession, reminders and activity", () => {
  const { routine, current } = create(),
    op = id(sequence++);
  db.sql(`insert into public.routine_reminder_preferences(routine_id,household_id,member_id,enabled)
    values('${routine.routineId}','${id(10)}','${id(2)}',true);
    select private.create_reminder_candidates_for_occurrence('${current.id}')`);
  const tables = [
    "routine_occurrences",
    "routine_completions",
    "routine_command_receipts",
    "reminder_candidates",
    "activity_events",
    "nest_chore_receipts",
  ];
  const snapshot = () =>
    tables.map((table) =>
      db.sql(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t`,
      ),
    );
  const before = snapshot();
  db.sql(`create function private.fixture_fail_completion() returns trigger language plpgsql as $$begin raise exception 'fixture receipt failure'; end$$;
    create trigger fixture_fail_completion before insert on public.nest_chore_receipts for each row execute function private.fixture_fail_completion()`);
  try {
    assert.throws(() => db.sql(as(command(current, op))), /fixture receipt failure/);
    assert.deepEqual(snapshot(), before);
  } finally {
    db.sql(
      "drop trigger fixture_fail_completion on public.nest_chore_receipts; drop function private.fixture_fail_completion()",
    );
  }
  assert.equal(JSON.parse(db.sql(as(command(current, op)))).outcome, "completed");
});

test("preseeded predictable legacy receipt cannot replace the native completion and receipts stay private", () => {
  const { current } = create(),
    op = id(sequence++);
  db.sql(`insert into public.routine_command_receipts(household_id,idempotency_key,command_kind,occurrence_id,result)
    values('${id(10)}','nest:${id(1)}:${op}','skip','${current.id}','{"forged":true}')`);
  const result = JSON.parse(db.sql(as(command(current, op))));
  assert.equal(result.outcome, "completed");
  assert.equal(
    db.sql(`select count(*) from public.routine_completions where occurrence_id='${current.id}'`),
    "1",
  );
  assert.equal(
    db.sql(as(`select count(*) from public.nest_chore_receipts where operation_id='${op}'`, id(2))),
    "0",
  );
  assert.throws(() => db.sql(as(command(current, op), id(3))), /not_found/);
  assert.throws(() => db.sql(`set role anon; ${command(current, op)}`), /permission denied/);
  assert.throws(
    () => db.sql(as(command({ ...current, due_date: "0001-01-01 BC" }, id(sequence++)))),
    /invalid_request/,
  );
});

test("unsupported successor dates roll back completion and leave the original current occurrence intact", () => {
  const { routine, current } = create(),
    op = id(sequence++);
  db.sql(`update public.routines set schedule_kind='after_completion',
    schedule_rule='{"kind":"after_completion","every":2147483647,"unit":"weeks"}' where id='${routine.routineId}'`);
  const before = counts(routine);
  assert.throws(() => db.sql(as(command(current, op))), /unsupported_occurrence_date/);
  assert.equal(counts(routine), before);
  assert.equal(
    db.sql(`select count(*) from public.routine_completions where occurrence_id='${current.id}'`),
    "0",
  );
  assert.equal(
    db.sql(`select count(*) from public.nest_chore_receipts where operation_id='${op}'`),
    "0",
  );
});

test("completion races with native edit and archive avoid deadlocks and duplicate history", async () => {
  for (const action of ["edit", "archive"]) {
    for (let index = 0; index < 6; index++) {
      const { routine, current } = create();
      const other =
        action === "edit"
          ? `select public.nest_edit_routine('${id(10)}','${id(sequence++)}','${routine.routineId}','${routine.version}','{"schedule":{"kind":"weekly","weekday":3}}')`
          : `select public.nest_set_routine_state('${id(10)}','${id(sequence++)}','${routine.routineId}','${routine.version}','archive')`;
      const results = await Promise.allSettled([
        db.concurrent(as(command(current, id(sequence++)))),
        db.concurrent(as(other, id(2))),
      ]);
      assert.ok(results.some((result) => result.status === "fulfilled"));
      for (const result of results) {
        if (result.status === "rejected") {
          assert.match(
            String(result.reason),
            /occurrence_conflict|not_found|could not obtain lock|Routine changed/,
          );
          assert.doesNotMatch(String(result.reason), /deadlock/);
        }
      }
      const completions = Number(
        db.sql(
          `select count(*) from public.routine_completions where occurrence_id='${current.id}'`,
        ),
      );
      assert.equal(completions, results[0].status === "fulfilled" ? 1 : 0);
      if (action === "archive" && results[1].status === "fulfilled")
        assert.equal(
          db.sql(
            `select count(*) from public.routine_occurrences where routine_id='${routine.routineId}' and role='preview'`,
          ),
          "0",
        );
    }
  }
});
