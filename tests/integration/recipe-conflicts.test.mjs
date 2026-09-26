import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { recipeSelectionFiles, id, week } from "../database/recipe-selection-fixture.mjs";
import { input as recipeInput } from "../database/recipe-creation-fixture.mjs";

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
    'recipes',(select jsonb_agg(to_jsonb(r) order by id) from public.meal_definitions r),
    'ingredients',(select jsonb_agg(to_jsonb(i) order by id) from public.meal_grocery_templates i),
    'entries',(select jsonb_agg(to_jsonb(e) order by id) from public.meal_plan_entries e),
    'snapshots',(select jsonb_agg(to_jsonb(s) order by entry_id) from public.nest_planned_recipe_snapshots s))`);
}
test("stale recipe writes and selection preserve the library and captured planned recipe", async (t) => {
  const f = await postgrestFixture(t, [
    ...recipeSelectionFiles,
    "supabase/migrations/20260920235917_native_recipe_archive.sql",
    "tests/integration/food-postgrest.sql",
    "supabase/migrations/20260926101436_native_recipe_nonretryable_conflicts.sql",
  ]);
  const create = { p_operation: id(900), p_input: recipeInput() };
  const created = await rpc(f, "nest_create_recipe", create);
  assert.equal(created.status, 200, JSON.stringify(created));
  assert.deepEqual(await rpc(f, "nest_create_recipe", create), created);
  const selection = {
    definitionId: created.body.definitionId,
    expectedLibraryRevision: created.body.revision,
    weekStart: week,
    expectedRevision: "0",
    date: week,
    slot: "dinner",
  };
  const selected = await rpc(f, "nest_place_recipe", { p_operation: id(901), p_input: selection });
  assert.equal(selected.status, 200, JSON.stringify(selected));
  const before = state(f);
  const cases = [
    { name: "nest_create_recipe", input: recipeInput() },
    {
      name: "nest_edit_recipe",
      input: {
        definitionId: created.body.definitionId,
        expectedRevision: "0",
        patch: { title: "Stale" },
        ingredients: null,
      },
    },
    {
      name: "nest_archive_recipe",
      input: { definitionId: created.body.definitionId, expectedRevision: "0" },
    },
    {
      name: "nest_place_recipe",
      input: {
        ...selection,
        expectedLibraryRevision: "0",
        expectedRevision: selected.body.revision,
      },
    },
    { name: "nest_place_recipe", input: selection },
  ];
  for (const entry of cases) {
    const result = await rpc(f, entry.name, { p_operation: id(902), p_input: entry.input });
    assert.equal(result.status, 412, JSON.stringify({ name: entry.name, ...result }));
    assert.equal(result.body.code, "PT412");
    assert.equal(state(f), before);
  }
  const planned = {
    p_week: week,
    p_revision: selected.body.revision,
    p_entry: selected.body.entryId,
  };
  const retained = await rpc(f, "nest_planned_recipe", planned);
  assert.equal(retained.status, 200);
  assert.equal((await rpc(f, "nest_planned_recipe", { ...planned, p_revision: "0" })).status, 412);
  const archived = await rpc(f, "nest_archive_recipe", {
    p_operation: id(903),
    p_input: { definitionId: created.body.definitionId, expectedRevision: created.body.revision },
  });
  assert.equal(archived.status, 200, JSON.stringify(archived));
  assert.deepEqual(await rpc(f, "nest_planned_recipe", planned), retained);
});
