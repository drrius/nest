import assert from "node:assert/strict";
import { test } from "node:test";
import { command as removalCommand } from "./meal-removal-fixture.mjs";
import { fixture, id, as } from "./meal-preparation-edit-fixture.mjs";
test("preparation edit serializes exact retry, preserves link and changes only supplied fields", async (t) => {
  const f = fixture(t),
    value = f.input({
      dueOn: "2030-01-05",
      assignment: { policy: "assigned", memberId: id(2) },
      instructions: null,
    });
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(f.command(id(820), value)))),
  );
  const saved = JSON.parse(results[0].stdout);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  assert.equal(saved.previousRoutineVersion, f.created.routineVersion);
  assert.equal(saved.revision, f.created.revision);
  assert.equal(saved.occurrenceId, f.created.occurrenceId);
  const state = f.state();
  assert.equal(state.routine.title, "Soak beans");
  assert.equal(state.routine.instructions, null);
  assert.equal(state.routine.active_from, "2030-01-05");
  assert.equal(state.routine.active_until, "2030-01-05");
  assert.equal(state.occurrence.due_date, "2030-01-05");
  assert.equal(state.occurrence.planned_assignee_id, id(2));
  assert.equal(state.occurrence.meal_plan_entry_id, f.meal.entryId);
  assert.equal(f.db.sql("select count(*) from public.nest_meal_preparation_edit_receipts"), "1");
  const next = f.edit(
    id(821),
    f.input({ instructions: "" }, { expectedRoutineVersion: saved.routineVersion }),
  );
  assert.equal(f.state().routine.instructions, "");
  assert.deepEqual(f.edit(id(820), value), saved);
  assert.notEqual(next.routineVersion, saved.routineVersion);
  assert.throws(() => f.edit(id(820), f.input({ title: "Other" })), /operation changed/);
});
test("finished preparation allows text corrections but keeps date, assignee and completion history", (t) => {
  const f = fixture(t);
  f.db.sql(
    as(
      `select public.complete_occurrence('${f.created.occurrenceId}','edit-finished','2030-01-06')`,
    ),
  );
  const before = f.state();
  const saved = f.edit(id(820), f.input({ title: "Corrected", instructions: "Already soaked" }));
  assert.equal(f.state().routine.title, "Corrected");
  assert.equal(f.state().occurrence.status, "completed");
  assert.equal(f.state().occurrence.due_date, before.occurrence.due_date);
  for (const patch of [
    { dueOn: "2030-01-05" },
    { assignment: { policy: "assigned", memberId: id(2) } },
  ]) {
    const stable = f.snapshot();
    assert.throws(
      () => f.edit(id(821), f.input(patch, { expectedRoutineVersion: saved.routineVersion })),
      /preparation changed/,
    );
    assert.equal(f.snapshot(), stable);
  }
  assert.equal(f.db.sql("select count(*) from public.routine_completions"), "1");
});
test("preparation edit receipt failure rolls back legacy edit receipts, task, notices and activity", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  const legacy = f.db.sql("select count(*) from private.routine_edit_receipts");
  const notices = () =>
    f.db.sql(
      "select jsonb_build_object('inbox',(select jsonb_agg(to_jsonb(t)) from public.inbox_notifications t),'push',(select jsonb_agg(to_jsonb(t)) from public.push_outbox t),'reminders',(select jsonb_agg(to_jsonb(t)) from public.reminder_candidates t))",
    );
  const beforeNotices = notices();
  f.db.sql(
    `create function private.reject_prep_edit() returns trigger language plpgsql as $$ begin raise exception 'Injected failure'; end $$; create trigger reject_prep_edit before insert on public.nest_meal_preparation_edit_receipts for each row execute function private.reject_prep_edit()`,
  );
  assert.throws(
    () =>
      f.edit(
        id(820),
        f.input({
          dueOn: "2030-01-05",
          instructions: null,
          assignment: { policy: "assigned", memberId: id(2) },
        }),
      ),
    /Injected failure/,
  );
  assert.equal(f.snapshot(), before);
  assert.equal(f.db.sql("select count(*) from private.routine_edit_receipts"), legacy);
  assert.equal(notices(), beforeNotices);
});
test("stale versions, foreign targets, hidden fields and invalid dates cannot edit preparation", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  for (const changes of [
    { expectedRevision: "0" },
    { routineId: id(999) },
    { entryId: id(999) },
    { expectedRoutineVersion: "2030-01-07T00:00:00.000000Z" },
  ])
    assert.throws(() => f.edit(id(820), f.input({ title: "Wrong" }, changes)), /changed|Reopen/);
  for (const patch of [
    {},
    { secret: true },
    { instructions: 1 },
    { dueOn: "2030-02-30" },
    { assignment: { policy: "assigned", memberId: id(3) } },
    { instructions: "🍲".repeat(2001) },
  ])
    assert.throws(() => f.edit(id(820), f.input(patch)), /Invalid|invalid|range|date/);
  assert.equal(f.snapshot(), before);
  assert.throws(() => f.edit(id(820), f.input(), id(3)), /authorized/);
  assert.equal(f.db.sql("select count(*) from public.nest_meal_preparation_edit_receipts"), "0");
});
test("old edit replay survives removal and remains private and membership-bound", (t) => {
  const f = fixture(t),
    value = f.input(),
    saved = f.edit(id(820), value);
  f.db.sql(`update public.meal_plan_entries set removed_at=now() where id='${f.meal.entryId}'`);
  assert.deepEqual(f.edit(id(820), value), saved);
  assert.throws(
    () =>
      f.edit(
        id(821),
        f.input(
          { title: "Later" },
          { expectedRoutineVersion: saved.routineVersion, expectedRevision: "2" },
        ),
      ),
    /changed/,
  );
  for (const actor of [id(2), id(3)])
    assert.equal(
      f.db.sql(as("select count(*) from public.nest_meal_preparation_edit_receipts", actor)),
      "0",
    );
  f.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.throws(() => f.edit(id(820), value), /authorized/);
});
test("concurrent preparation edit and closure preserve one finished occurrence and valid history", async (t) => {
  for (let n = 0; n < 8; n++) {
    const f = fixture(t);
    const results = await Promise.allSettled([
      f.db.concurrent(
        as(
          f.command(
            id(820),
            f.input({ dueOn: "2030-01-05", assignment: { policy: "assigned", memberId: id(2) } }),
          ),
        ),
      ),
      f.db.concurrent(
        as(
          `select public.complete_occurrence('${f.created.occurrenceId}','race-${n}','2030-01-06')`,
        ),
      ),
    ]);
    assert.ok(results.some((result) => result.status === "fulfilled"));
    const state = f.state();
    assert.equal(state.occurrence.meal_plan_entry_id, f.meal.entryId);
    assert.equal(
      f.db.sql(
        `select count(*) from public.routine_occurrences where meal_plan_entry_id='${f.meal.entryId}'`,
      ),
      "1",
    );
    if (results[0].status === "fulfilled") assert.equal(state.occurrence.due_date, "2030-01-05");
    else assert.equal(state.occurrence.due_date, "2030-01-06");
    if (results[1].status === "fulfilled") {
      assert.equal(state.occurrence.status, "completed");
      assert.equal(f.db.sql("select count(*) from public.routine_completions"), "1");
    }
  }
});

test("preparation edits race safely with removal and cannot leave open orphan work", async (t) => {
  for (let n = 0; n < 8; n++) {
    const f = fixture(t);
    const results = await Promise.allSettled([
      f.db.concurrent(as(f.command(id(820), f.input({ dueOn: "2030-01-05" })))),
      f.db.concurrent(removalCommand(id(821), f.meal)),
    ]);
    assert.ok(results.some((result) => result.status === "fulfilled"));
    const removed =
      f.db.sql(
        `select removed_at is not null from public.meal_plan_entries where id='${f.meal.entryId}'`,
      ) === "t";
    if (removed) assert.equal(f.state().occurrence.status, "skipped");
    assert.equal(
      f.db.sql(
        `select count(*) from public.routine_occurrences where meal_plan_entry_id='${f.meal.entryId}'`,
      ),
      "1",
    );
  }
});
test("preparation editing rejects anonymous/direct receipt writes and unsupported isolation", (t) => {
  const f = fixture(t);
  assert.throws(
    () => f.db.sql(`set role anon; ${f.command(id(820), f.input())}`),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql(as("delete from public.nest_meal_preparation_edit_receipts")),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql(`begin isolation level repeatable read; ${as(f.command(id(820), f.input()))}`),
    /current snapshot/,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_meal_preparation_edit_receipts"), "0");
});
