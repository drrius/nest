import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { choreChangeFiles } from "./chore-change-files.mjs";
const db = startFixturePostgres();
after(() => db.stop());
for (const file of choreChangeFiles) db.file(file);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const as = (sql, actor = id(1)) =>
  `set role authenticated; set request.jwt.claim.sub='${actor}'; ${sql}`;
let sequence = 100;
function create() {
  const definition = JSON.stringify({
    title: "Change fixture",
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
const command = (c, op, action = "skip", date = "null") =>
  `select public.nest_change_chore('${c.household ?? id(10)}','${op}','${c.id}','${c.due_date}','${action}',${date})`;
const next = (c) => `'${c.due_date}'::date+1`;

test("skip and reschedule bind their exact receipts and replay without repeating history", async () => {
  for (const action of ["skip", "reschedule"]) {
    const { current } = create(),
      op = id(sequence++);
    const sql = command(current, op, action, action === "skip" ? "null" : next(current));
    const calls = await Promise.all(Array.from({ length: 3 }, () => db.concurrent(as(sql))));
    const receipt = JSON.parse(calls[0].stdout);
    for (const call of calls) assert.deepEqual(JSON.parse(call.stdout), receipt);
    assert.equal(receipt.actorId, id(1));
    assert.equal(receipt.householdId, id(10));
    assert.equal(receipt.occurrenceId, current.id);
    assert.equal(receipt.action, action);
    assert.equal(receipt.previousDueDate, current.due_date);
    assert.equal(receipt.status, action === "skip" ? "skipped" : "open");
    assert.equal(
      db.sql(`select count(*) from public.activity_events where entity_id='${current.id}'`),
      "1",
    );
    assert.throws(
      () => db.sql(as(command(current, op, "reschedule", `'${current.due_date}'::date+2`))),
      /operation changed/,
    );
  }
});

test("reschedule replay survives partner definition rebuild deleting the original occurrence", () => {
  const { routine, current } = create(),
    op = id(sequence++);
  const sql = command(current, op, "reschedule", next(current));
  const original = db.sql(as(sql));
  db.sql(
    as(
      `select public.nest_edit_routine('${id(10)}','${id(sequence++)}','${routine.routineId}','${routine.version}','{"schedule":{"kind":"weekly","weekday":3}}')`,
      id(2),
    ),
  );
  assert.equal(
    db.sql(`select count(*) from public.routine_occurrences where id='${current.id}'`),
    "0",
  );
  assert.equal(db.sql(as(sql)), original);
});

test("changed occurrence, preview, paused and archived state conflict without new receipts", () => {
  for (const change of ["reschedule", "complete", "preview", "pause", "archive"]) {
    const { routine, current } = create();
    if (change === "reschedule")
      db.sql(as(command(current, id(sequence++), "reschedule", next(current))));
    if (change === "complete")
      db.sql(
        as(
          `select public.nest_complete_chore('${current.id}','${id(sequence++)}','${current.due_date}','${current.due_date}')`,
        ),
      );
    if (change === "preview")
      current.id = db.sql(
        `select id from public.routine_occurrences where routine_id='${routine.routineId}' and role='preview'`,
      );
    if (["pause", "archive"].includes(change))
      db.sql(
        as(
          `select public.nest_set_routine_state('${id(10)}','${id(sequence++)}','${routine.routineId}','${routine.version}','${change}')`,
        ),
      );
    const op = id(sequence++);
    assert.throws(() => db.sql(as(command(current, op))), /Chore changed/);
    assert.equal(
      db.sql(`select count(*) from public.nest_chore_change_receipts where operation_id='${op}'`),
      "0",
    );
  }
});

test("tenant and actor isolation protect commands and receipt replay, including revoked membership", () => {
  const { current } = create(),
    op = id(sequence++),
    sql = command(current, op);
  db.sql(as(sql));
  assert.equal(
    db.sql(
      as(
        `select count(*) from public.nest_chore_change_receipts where operation_id='${op}'`,
        id(2),
      ),
    ),
    "0",
  );
  assert.throws(
    () => db.sql(as(command({ ...current, household: id(20) }, op), id(3))),
    /Chore unavailable/,
  );
  assert.throws(() => db.sql(as(sql, id(3))), /Not authorized/);
  assert.throws(() => db.sql(`set role anon; ${sql}`), /permission denied/);
  assert.throws(
    () => db.sql(as(`delete from public.nest_chore_change_receipts`)),
    /permission denied/,
  );
  assert.throws(
    () =>
      db.sql(`begin; delete from public.routine_completions; delete from public.push_outbox;
    delete from public.inbox_notifications; delete from public.activity_events;
    delete from public.household_members where user_id='${id(1)}'; ${as(sql)}; commit`),
    /Not authorized/,
  );
});

test("skip versus completion selects one canonical closure without a duplicate successor", async () => {
  for (let index = 0; index < 12; index++) {
    const { routine, current } = create();
    const results = await Promise.allSettled([
      db.concurrent(as(command(current, id(sequence++)))),
      db.concurrent(
        as(
          `select public.nest_complete_chore('${current.id}','${id(sequence++)}','${current.due_date}','${current.due_date}')`,
          id(2),
        ),
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.match(
      String(results.find((r) => r.status === "rejected").reason),
      /Chore changed|occurrence_conflict/,
    );
    assert.equal(
      db.sql(
        `select count(*) from public.routine_occurrences where routine_id='${routine.routineId}' and status='open'`,
      ),
      "2",
    );
  }
});

test("receipt failure rolls back all reschedule side effects", () => {
  const { routine, current } = create(),
    op = id(sequence++);
  db.sql(`insert into public.routine_reminder_preferences(routine_id,household_id,member_id,enabled)
    values('${routine.routineId}','${id(10)}','${id(2)}',true);
    select private.create_reminder_candidates_for_occurrence('${current.id}')`);
  const tables = [
    "routine_occurrences",
    "routine_command_receipts",
    "activity_events",
    "reminder_candidates",
    "inbox_notifications",
    "push_outbox",
    "nest_chore_change_receipts",
  ];
  const snapshot = () =>
    tables.map((table) =>
      db.sql(
        `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.${table} t`,
      ),
    );
  const before = snapshot();
  db.sql(`create function private.fixture_fail_change() returns trigger language plpgsql as $$begin raise exception 'fixture change failure'; end$$;
    create trigger fixture_fail_change before insert on public.nest_chore_change_receipts for each row execute function private.fixture_fail_change()`);
  try {
    assert.throws(
      () => db.sql(as(command(current, op, "reschedule", next(current)))),
      /fixture change failure/,
    );
    assert.deepEqual(snapshot(), before);
  } finally {
    db.sql(
      "drop trigger fixture_fail_change on public.nest_chore_change_receipts; drop function private.fixture_fail_change()",
    );
  }
  assert.equal(
    JSON.parse(db.sql(as(command(current, op, "reschedule", next(current))))).action,
    "reschedule",
  );
});

test("invalid action/date combinations and unsupported dates fail without mutation", () => {
  const { current } = create();
  for (const [action, date] of [
    ["delete", "null"],
    ["skip", next(current)],
    ["reschedule", "null"],
    ["reschedule", `'${current.due_date}'`],
    ["reschedule", "'10000-01-01'"],
    ["reschedule", "'infinity'"],
  ])
    assert.throws(
      () => db.sql(as(command(current, id(sequence++), action, date))),
      /Invalid chore change/,
    );
  assert.throws(
    () => db.sql(as(command({ ...current, due_date: "0001-01-01 BC" }, id(sequence++)))),
    /Invalid chore change/,
  );
});
