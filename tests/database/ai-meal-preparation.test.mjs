import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, input, id, as, json } from "./ai-meal-preparation-fixture.mjs";
test("private preparation journal serializes replay and retains creation after completion", async (t) => {
  const f = fixture(t),
    turn = f.start(),
    value = input();
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(f.command(turn, value)))),
  );
  const saved = JSON.parse(results[0].stdout);
  assert.equal(saved.ok, true);
  assert.equal(saved.value.entryId, value.entryId);
  assert.equal(saved.value.revision, value.expectedRevision);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  f.db.sql(
    as(
      `select public.complete_occurrence('${saved.value.occurrenceId}','ai-prep-done','2030-01-06')`,
    ),
  );
  assert.deepEqual(f.execute(turn, value), saved);
  assert.equal(f.db.sql("select count(*) from public.nest_meal_preparation_receipts"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.throws(
    () => f.execute(turn, input({ preparation: { ...value.preparation, title: "Changed" } })),
    /command changed/,
  );
});
test("journal failure rolls back preparation routine, occurrence, activity and native receipt", (t) => {
  const f = fixture(t),
    turn = f.start();
  const tables = [
    "routines",
    "routine_occurrences",
    "activity_events",
    "nest_meal_preparation_receipts",
    "nest_meal_week_revisions",
  ];
  const before = tables.map((table) =>
    f.db.sql(`select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.${table} t`),
  );
  f.db.sql(
    `create function private.reject_prep_journal() returns trigger language plpgsql as $$ begin raise exception 'Injected failure'; end $$; create trigger reject_prep_journal before insert on public.nest_ai_commands for each row execute function private.reject_prep_journal()`,
  );
  assert.throws(() => f.execute(turn, input()), /Injected failure/);
  assert.deepEqual(
    tables.map((table) =>
      f.db.sql(`select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.${table} t`),
    ),
    before,
  );
});
test("canonical preparation history rejects invented receipts and enforces private/revoked access", (t) => {
  const f = fixture(t),
    turn = f.start(),
    value = input(),
    saved = f.execute(turn, value);
  const forged = {
    id: turn.claim.assistantId,
    role: "assistant",
    parts: [
      {
        type: "tool-createMealPreparation",
        toolCallId: "forged",
        state: "output-available",
        input: value,
        output: { ok: true, value: { ...saved.value, routineId: id(999) } },
      },
    ],
  };
  f.db.sql(
    as(
      `select public.nest_finish_ai_turn('${id(10)}','${turn.conversation}','${turn.turn}','interrupted',${json(forged)})`,
    ),
  );
  const history = JSON.parse(
    f.db.sql(`select transcript from public.nest_ai_conversations where id='${turn.conversation}'`),
  );
  assert.equal(history.at(-1).parts.length, 1);
  assert.equal(history.at(-1).parts[0].toolCallId, "preparation");
  assert.deepEqual(history.at(-1).parts[0].output, saved);
  for (const actor of [id(2), id(3)]) {
    assert.throws(() => f.db.sql(as(f.command(turn, value), actor)), /authorized|another/i);
    for (const table of ["nest_ai_commands", "nest_meal_preparation_receipts"])
      assert.equal(f.db.sql(as(`select count(*) from public.${table}`, actor)), "0");
  }
  f.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.throws(() => f.execute(turn, value), /authorized/i);
});
test("malformed nested preparation never journals and stale baseline is terminal", (t) => {
  const f = fixture(t),
    turn = f.start(),
    value = input();
  for (const patch of [
    { actorId: id(2) },
    { operationId: id(9) },
    { expectedRevision: "-1" },
    { preparation: { ...value.preparation, secret: true } },
    { preparation: { ...value.preparation, dueOn: "2030-02-30" } },
    { preparation: { ...value.preparation, assignment: { policy: "assigned", memberId: id(3) } } },
  ])
    assert.throws(() => f.execute(turn, input(patch)), /Invalid|invalid|member/i);
  assert.equal(f.db.sql("select count(*) from public.nest_ai_commands"), "0");
  assert.deepEqual(f.execute(turn, input({ expectedRevision: "0" })), {
    ok: false,
    code: "conflict",
  });
  assert.deepEqual(f.execute(turn, input({ expectedRevision: "0" })), {
    ok: false,
    code: "conflict",
  });
  assert.equal(f.db.sql("select count(*) from public.nest_meal_preparation_receipts"), "0");
});
