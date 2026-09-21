import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, json } from "./meal-ingredients-fixture.mjs";
test("bounded review pages use retained source identity and distinguish previously added items", (t) => {
  const f = fixture(t),
    original = f.snapshot.recipe.ingredients[0];
  const ingredients = Array.from({ length: 200 }, (_, n) => ({
    ...original,
    ingredientId: id(1000 + n),
    order: n,
    quantity: String(n),
    unit: n % 2 ? "g" : "cups",
  }));
  f.db.sql(
    `update public.nest_planned_recipe_snapshots set recipe=jsonb_set(recipe,'{ingredients}',${json(ingredients)}) where entry_id='${f.placed.entryId}'`,
  );
  const first = f.review(),
    second = f.review(first.nextAfter);
  assert.equal(first.ingredients.length, 100);
  assert.equal(second.ingredients.length, 100);
  assert.equal(second.nextAfter, null);
  const all = [...first.ingredients, ...second.ingredients];
  assert.equal(new Set(all.map((i) => i.ingredientId)).size, 200);
  assert.deepEqual(
    all.map((i) => [i.quantity, i.unit]),
    ingredients.map((i) => [i.quantity, i.unit]),
  );
  f.add(
    id(900),
    f.input({
      selected: [all[0]].map(({ entryId, ingredientId, quantity, unit }) => ({
        entryId,
        ingredientId,
        quantity,
        unit,
      })),
    }),
  );
  const refreshed = f.review();
  assert.ok(refreshed.ingredients[0].groceryItemId);
  assert.equal(refreshed.ingredients[1].groceryItemId, null);
});
test("review rejects stale cursors and foreign households and identifies meals without shopping sources", (t) => {
  const f = fixture(t);
  assert.throws(() => f.review({ entryId: id(1), ingredientId: "bad" }), /Invalid/);
  assert.throws(() => f.review(null, { revision: "0" }), /changed/);
  assert.throws(() => f.review(null, { actor: id(3) }), /authorized/);
  f.db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values('${id(801)}','${id(10)}','2030-01-08','dinner','Unknown ingredients'); insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot,leftover_of_entry_id) values('${id(802)}','${id(10)}','2030-01-09','dinner','Leftovers','${f.placed.entryId}')`,
  );
  const revision = f.db.sql(
    `select revision from public.nest_meal_week_revisions where household_id='${id(10)}' and week_start='2030-01-07'`,
  );
  assert.deepEqual(f.review(null, { revision }).skipped, [
    { entryId: id(801), reason: "no_recipe" },
    { entryId: id(802), reason: "leftovers" },
  ]);
});
