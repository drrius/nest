import assert from "node:assert/strict";
import { test } from "node:test";
import { mealRemovalFiles } from "../database/meal-removal-files.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = { entryId: id(100), weekStart: "2030-01-07", expectedRevision: "1" };
async function rpc(f, name, fields) {
  const response = await fetch(`${f.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({ p_household: id(10), ...fields }),
  });
  return { status: response.status, body: await response.json() };
}
function state(f) {
  return f.db.sql(`select jsonb_build_object(
    'routines',(select jsonb_agg(to_jsonb(r) order by id) from public.routines r),
    'occurrences',(select jsonb_agg(to_jsonb(o) order by id) from public.routine_occurrences o),
    'createReceipts',(select jsonb_agg(to_jsonb(r) order by operation_id) from public.nest_meal_preparation_receipts r),
    'editReceipts',(select jsonb_agg(to_jsonb(r) order by operation_id) from public.nest_meal_preparation_edit_receipts r))`);
}
async function stale(f, name, input) {
  const before = state(f);
  const result = await rpc(f, name, { p_operation: id(250), p_input: input });
  assert.equal(result.status, 412, JSON.stringify(result));
  assert.equal(result.body.code, "PT412");
  assert.equal(state(f), before);
}
test("stale preparation creates/edits preserve chores and current edits replay exactly", async (t) => {
  const f = await postgrestFixture(t, [
    ...mealRemovalFiles,
    "supabase/migrations/20260920093203_native_routine_editing.sql",
    "supabase/migrations/20260921024101_native_meal_preparation.sql",
    "supabase/migrations/20260921024848_native_meal_preparation_read.sql",
    "supabase/migrations/20260921032305_native_meal_preparation_editing.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260926102144_native_preparation_nonretryable_conflicts.sql",
  ]);
  f.db.sql(`insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot)
    values ('${id(100)}','${id(10)}','2030-01-07','dinner','Pasta')`);
  const input = {
    ...target,
    preparation: {
      title: "Prepare pasta",
      instructions: null,
      dueOn: "2030-01-06",
      assignment: { policy: "shared" },
    },
  };
  await stale(f, "nest_create_meal_preparation", { ...input, expectedRevision: "0" });
  await stale(f, "nest_create_meal_preparation", { ...input, entryId: id(999) });
  const create = { p_operation: id(200), p_input: input };
  const created = await rpc(f, "nest_create_meal_preparation", create);
  assert.equal(created.status, 200, JSON.stringify(created));
  assert.deepEqual(await rpc(f, "nest_create_meal_preparation", create), created);
  await stale(f, "nest_create_meal_preparation", input);
  const edit = {
    ...target,
    routineId: created.body.routineId,
    expectedRoutineVersion: created.body.routineVersion,
    patch: { title: "Prepare sauce" },
  };
  for (const changed of [
    { expectedRevision: "0" },
    { entryId: id(999) },
    { routineId: id(999) },
    { expectedRoutineVersion: "2000-01-01T00:00:00.000000Z" },
  ])
    await stale(f, "nest_edit_meal_preparation", { ...edit, ...changed });
  const read = await rpc(f, "nest_meal_preparation", {
    p_week: target.weekStart,
    p_revision: "0",
    p_entry: target.entryId,
  });
  assert.equal(read.status, 412);
  const command = { p_operation: id(201), p_input: edit };
  const saved = await rpc(f, "nest_edit_meal_preparation", command);
  assert.equal(saved.status, 200, JSON.stringify(saved));
  assert.deepEqual(await rpc(f, "nest_edit_meal_preparation", command), saved);
  assert.equal(f.db.sql("select title from public.routines"), "Prepare sauce");
  assert.equal(f.db.sql("select count(*) from public.nest_meal_preparation_edit_receipts"), "1");
});
