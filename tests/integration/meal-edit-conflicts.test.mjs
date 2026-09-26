import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { recipeSelectionFiles, id, week } from "../database/recipe-selection-fixture.mjs";
const patch = "supabase/migrations/20260926100816_native_meal_edit_nonretryable_conflicts.sql";

function linkPreparation(f, entry) {
  const definition = {
    title: "Prepare fixture meal",
    schedule: { kind: "one_off", date: week },
    assignment: { policy: "shared" },
  };
  const receipt = JSON.parse(
    f.db.sql(`set role authenticated;
    set request.jwt.claims='{"sub":"${id(1)}"}';
    select public.nest_create_routine('${id(10)}','${id(950)}','${JSON.stringify(definition)}')`),
  );
  f.db.sql(`update public.routine_occurrences set meal_plan_entry_id='${entry}'
    where routine_id='${receipt.routineId}' and role='current'`);
}

async function call(f, name, input, operation = 901) {
  const response = await fetch(`${f.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({ p_household: id(10), p_operation: id(operation), p_input: input }),
  });
  return { status: response.status, body: await response.json() };
}

test("stale meal edits reject without changing the week and fresh placement replays exactly", async (t) => {
  const f = await postgrestFixture(t, [
    ...recipeSelectionFiles,
    "supabase/migrations/20260921020754_native_meal_leftovers.sql",
    "tests/integration/food-postgrest.sql",
    patch,
  ]);
  const rpc = (name, input, operation) => call(f, name, input, operation);
  const place = {
    weekStart: week,
    expectedRevision: "0",
    date: week,
    slot: "dinner",
    title: "Fixture meal",
  };
  const receipt = await rpc("nest_place_meal", place);
  assert.equal(receipt.status, 200, JSON.stringify(receipt));
  assert.deepEqual(await rpc("nest_place_meal", place), receipt);
  const entry = f.db.sql("select id from public.meal_plan_entries limit 1");
  linkPreparation(f, entry);
  const preparation = () =>
    f.db.sql("select jsonb_agg(to_jsonb(o) order by id) from public.routine_occurrences o");
  const beforePreparation = preparation();
  const snapshot = () =>
    f.db.sql("select jsonb_agg(to_jsonb(e) order by id) from public.meal_plan_entries e");
  const before = snapshot();
  const cases = [
    { name: "nest_place_meal", input: place },
    { name: "nest_remove_meal", input: { weekStart: week, expectedRevision: "0", entryId: entry } },
    { name: "nest_replace_meal", input: { ...place, entryId: entry } },
    {
      name: "nest_move_meal",
      input: {
        sourceWeekStart: week,
        targetWeekStart: week,
        expectedSourceRevision: "0",
        expectedTargetRevision: "0",
        entryId: entry,
        date: f.db.sql(`select (date '${week}'+1)::text`),
        slot: "dinner",
      },
    },
    {
      name: "nest_place_leftovers",
      input: {
        sourceWeekStart: week,
        targetWeekStart: week,
        expectedSourceRevision: "0",
        expectedTargetRevision: "0",
        entryId: entry,
        date: f.db.sql(`select (date '${week}'+1)::text`),
        slot: "dinner",
      },
    },
  ];
  for (const value of cases) {
    const result = await rpc(value.name, value.input, 902);
    assert.equal(result.status, 412, JSON.stringify({ name: value.name, ...result }));
    assert.equal(result.body.code, "PT412");
    assert.equal(snapshot(), before);
    assert.equal(preparation(), beforePreparation);
  }
  const revision = f.db.sql(`select revision from public.nest_meal_week_revisions
    where household_id='${id(10)}' and week_start='${week}'`);
  const removal = { weekStart: week, expectedRevision: revision, entryId: entry };
  const removed = await rpc("nest_remove_meal", removal, 903);
  assert.equal(removed.status, 200, JSON.stringify(removed));
  assert.deepEqual(await rpc("nest_remove_meal", removal, 903), removed);
  assert.equal(
    f.db.sql(`select count(*) from public.routine_occurrences
    where meal_plan_entry_id='${entry}' and status='open' and role='current'`),
    "0",
  );
});
