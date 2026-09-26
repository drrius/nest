import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id } from "./meal-ingredient-api-fixture.mjs";

async function rpc(f, name, fields) {
  const response = await fetch(`${f.remote.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.remote.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({ p_household: id(10), ...fields }),
  });
  return { status: response.status, body: await response.json() };
}
function state(f) {
  return f.remote.db.sql(`select jsonb_build_object(
    'groceries',(select jsonb_agg(to_jsonb(g) order by id) from public.grocery_items g),
    'sources',(select jsonb_agg(to_jsonb(s) order by entry_id,ingredient_id) from private.nest_meal_ingredient_additions s),
    'receipts',(select jsonb_agg(to_jsonb(r) order by operation_id) from private.nest_meal_ingredient_receipts r))`);
}
test("stale ingredient review and missing batch sources reject without partial groceries or receipts", async (t) => {
  const f = await fixture(t, false, [
    "supabase/migrations/20260926101925_native_ingredient_nonretryable_conflicts.sql",
  ]);
  const page = await (await f.post("read", f.query)).json();
  const selected = page.ingredients.map(({ entryId, ingredientId }) => ({
    entryId,
    ingredientId,
    quantity: "2",
    unit: null,
  }));
  const input = {
    weekStart: page.weekStart,
    expectedRevision: page.revision,
    selected,
  };
  const before = state(f);
  const read = await rpc(f, "nest_read_meal_ingredients", {
    p_week: page.weekStart,
    p_revision: "0",
    p_after: null,
  });
  assert.equal(read.status, 412);
  assert.equal(read.body.code, "PT412");
  for (const stale of [
    { ...input, expectedRevision: "0" },
    { ...input, selected: [...selected, { ...selected[0], ingredientId: id(9999) }] },
    { ...input, selected: [{ ...selected[0], entryId: id(9999) }] },
  ]) {
    const result = await rpc(f, "nest_add_meal_ingredients", {
      p_operation: id(890),
      p_input: stale,
    });
    assert.equal(result.status, 412, JSON.stringify(result));
    assert.equal(result.body.code, "PT412");
    assert.equal(state(f), before);
  }
  assert.equal(
    (await f.post("add", { ...input, expectedRevision: "0", operationId: id(891) })).status,
    409,
  );
  const value = { ...input, operationId: id(892) };
  const added = await f.post("add", value);
  assert.equal(added.status, 200);
  const receipt = await added.json();
  assert.deepEqual(await (await f.post("add", value)).json(), receipt);
  assert.equal(
    f.remote.db.sql("select count(*) from public.grocery_items"),
    String(selected.length),
  );
  assert.equal(f.remote.db.sql("select count(*) from private.nest_meal_ingredient_receipts"), "1");
});
