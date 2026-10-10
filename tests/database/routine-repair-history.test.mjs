import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startFixturePostgres } from "./fixture-postgres.mjs";
import { as, id } from "./money-expense-helpers.mjs";

const db = startFixturePostgres();
after(() => db.stop());
db.file("tests/database/routine-closure-fixture.sql");
db.file("supabase/migrations/20260920082522_native_routine_creation.sql");
let sequence = 15000;

function prepare(schedule, due, original, completed) {
  const input = JSON.stringify({
    title: "History repair fixture",
    schedule,
    assignment: { policy: "alternating", anchorMemberId: id(1) },
  });
  const routine = JSON.parse(
    db.sql(as(1, `select public.nest_create_routine('${id(10)}','${id(sequence++)}','${input}')`)),
  ).routineId;
  const occurrence = db.sql(`select id from public.routine_occurrences
    where routine_id='${routine}' and role='current'`);
  db.sql(`delete from public.routine_occurrences where routine_id='${routine}' and role='preview';
    update public.routine_occurrences set due_date='${due}',original_due_date='${original}',
      status='completed',role=null,closed_at='${completed}T12:00:00Z'
      where id='${occurrence}';
    insert into public.routine_completions(occurrence_id,household_id,completed_by_member_id,completed_on)
      values('${occurrence}','${id(10)}','${id(1)}','${completed}');`);
  return { routine, occurrence };
}

const history = (occurrence) =>
  db.sql(`select jsonb_build_object(
  'occurrence',(select to_jsonb(o) from public.routine_occurrences o where id='${occurrence}'),
  'completion',(select to_jsonb(c) from public.routine_completions c where occurrence_id='${occurrence}'))`);
const window = (routine) =>
  JSON.parse(
    db.sql(`select coalesce(jsonb_agg(
  jsonb_build_object('role',role,'due',due_date,'original',original_due_date,'assignee',planned_assignee_id)
  order by due_date),'[]') from public.routine_occurrences
  where routine_id='${routine}' and status='open'`),
  );

const cases = [
  {
    schedule: { kind: "monthly", dayOfMonth: 31 },
    due: "2026-01-31",
    original: "2026-01-31",
    completed: "2026-02-05",
    dates: ["2026-02-28", "2026-03-31"],
  },
  {
    schedule: { kind: "monthly", dayOfMonth: 31 },
    due: "2028-01-31",
    original: "2028-01-31",
    completed: "2028-02-05",
    dates: ["2028-02-29", "2028-03-31"],
  },
  {
    schedule: { kind: "biweekly", weekday: 1 },
    due: "2026-03-05",
    original: "2026-02-23",
    completed: "2026-03-05",
    dates: ["2026-03-09", "2026-03-23"],
  },
  {
    schedule: { kind: "after_completion", every: 3, unit: "days" },
    due: "2026-02-20",
    original: "2026-02-20",
    completed: "2026-02-26",
    dates: ["2026-03-01", "2026-03-04"],
  },
  {
    schedule: { kind: "after_completion", every: 2, unit: "weeks" },
    due: "2026-02-20",
    original: "2026-02-20",
    completed: "2026-02-26",
    dates: ["2026-03-12", "2026-03-26"],
  },
];

for (const { schedule, due, original, completed, dates } of cases) {
  test(`repair preserves closed history and literal ${schedule.kind} dates from ${original}`, () => {
    const { routine, occurrence } = prepare(schedule, due, original, completed);
    const before = history(occurrence);
    const command = `select private.ensure_routine_window('${routine}',null,null)`;
    db.sql(command);
    assert.deepEqual(
      window(routine),
      dates.map((date, index) => ({
        role: index === 0 ? "current" : "preview",
        due: date,
        original: date,
        assignee: id(index === 0 ? 2 : 1),
      })),
    );
    const retained = db.sql(`select jsonb_agg(to_jsonb(o) order by id)
      from public.routine_occurrences o where routine_id='${routine}'`);
    db.sql(command);
    assert.equal(
      db.sql(`select jsonb_agg(to_jsonb(o) order by id)
      from public.routine_occurrences o where routine_id='${routine}'`),
      retained,
    );
    assert.equal(history(occurrence), before);
  });
}

test("missing preview follows the original biweekly anchor without rewriting rescheduled current", () => {
  const input = JSON.stringify({
    title: "Missing preview fixture",
    schedule: { kind: "biweekly", weekday: 1 },
    assignment: { policy: "alternating", anchorMemberId: id(1) },
  });
  const routine = JSON.parse(
    db.sql(as(1, `select public.nest_create_routine('${id(10)}','${id(sequence++)}','${input}')`)),
  ).routineId;
  db.sql(`delete from public.routine_occurrences where routine_id='${routine}' and role='preview';
    update public.routine_occurrences set due_date='2026-03-05',original_due_date='2026-02-23',
      rescheduled_at='2026-02-24T10:00:00Z' where routine_id='${routine}' and role='current';`);
  const current = db.sql(`select to_jsonb(o) from public.routine_occurrences o
    where routine_id='${routine}' and role='current'`);
  const command = `select private.ensure_routine_window('${routine}',null,null)`;
  db.sql(command);
  assert.deepEqual(window(routine), [
    { role: "current", due: "2026-03-05", original: "2026-02-23", assignee: id(1) },
    { role: "preview", due: "2026-03-09", original: "2026-03-09", assignee: id(2) },
  ]);
  assert.equal(
    db.sql(`select to_jsonb(o) from public.routine_occurrences o
    where routine_id='${routine}' and role='current'`),
    current,
  );
  const beforeRetry = db.sql(`select jsonb_agg(to_jsonb(o) order by id)
    from public.routine_occurrences o where routine_id='${routine}'`);
  db.sql(command);
  assert.equal(
    db.sql(`select jsonb_agg(to_jsonb(o) order by id)
    from public.routine_occurrences o where routine_id='${routine}'`),
    beforeRetry,
  );
});
