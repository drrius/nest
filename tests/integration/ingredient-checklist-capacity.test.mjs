import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, id, week } from "./meal-ingredient-api-fixture.mjs";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { groceryClient } from "../../apps/mobile/src/groceries/client.ts";
import { groceryFlow } from "../../apps/mobile/src/groceries/flow.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const files = [
  "tests/database/ingredient-checklist-columns.sql",
  "supabase/migrations/20260919214311_native_grocery_check_receipts.sql",
  "supabase/migrations/20260920002735_native_grocery_commands.sql",
  "supabase/migrations/20260921090604_native_grocery_snapshot.sql",
];
function fullWeek(f) {
  const entry = f.placed.entryId;
  f.remote.db
    .sql(`insert into public.meal_plan_entries(id,household_id,date,slot,meal_definition_id,title_snapshot,recipe_url_snapshot,notes)
    select ('00000000-0000-4000-8000-'||lpad((10000+n)::text,12,'0'))::uuid,'${id(10)}','${week}'::date+n/3,
      (array['breakfast','lunch','dinner'])[n%3+1],meal_definition_id,title_snapshot,recipe_url_snapshot,notes
    from public.meal_plan_entries cross join generate_series(0,20) n where id='${entry}' and n<>2;
    insert into public.nest_planned_recipe_snapshots(household_id,entry_id,library_revision,recipe)
      select e.household_id,e.id,s.library_revision,s.recipe from public.meal_plan_entries e
      cross join public.nest_planned_recipe_snapshots s where s.entry_id='${entry}' and e.id<>s.entry_id;
    update public.nest_planned_recipe_snapshots set recipe=jsonb_set(recipe,'{ingredients}',
      (select jsonb_agg(jsonb_set(jsonb_set(recipe->'ingredients'->0,'{ingredientId}',
        to_jsonb('00000000-0000-4000-8000-'||lpad((11000+n)::text,12,'0'))),'{order}',to_jsonb(n)) order by n)
       from generate_series(0,199) n));`);
  return JSON.parse(
    f.remote.db
      .sql(`select jsonb_build_object('operationId','${id(950)}','weekStart','${week}','expectedRevision',
    (select revision::text from public.nest_meal_week_revisions where household_id='${id(10)}' and week_start='${week}'),
    'selected',(select jsonb_agg(jsonb_build_object('entryId',entry_id,'ingredientId',i->>'ingredientId',
      'quantity',i->'quantity','unit',i->'unit') order by entry_id,i->>'ingredientId')
      from public.nest_planned_recipe_snapshots cross join lateral jsonb_array_elements(recipe->'ingredients') i))`),
  );
}
test("a full 4200-ingredient addition remains readable and checkable after native SQLite restart", async (t) => {
  const f = await fixture(t, false, files),
    local = await sqlite(t);
  const account = { actor: id(1), household: id(10) };
  const credentials = Effect.succeed({
    access_token: f.remote.bearer,
    refresh_token: "fixture",
    user: { id: id(1) },
  });
  const url = new URL("/", f.url).href;
  const meals = mealClient(url, account, credentials),
    groceries = groceryClient(url, account, credentials);
  const receipt = await run(meals.ingredients.add(fullWeek(f)));
  assert.equal(receipt.ingredients.length, 4200);
  const rows = await run(groceries.list());
  assert.equal(rows.length, 4200);
  assert.equal(new Set(rows.map((row) => row.itemId)).size, 4200);
  assert.equal(new Set(rows.map((row) => row.mealSource.entryId)).size, 21);
  assert.ok(rows.every((row) => row.mealSource.title === "Legacy soup" && row.quantity === "1/2"));
  const session = await run(local.store.activate(account, id(951)));
  await run(local.store.saveGroceries(session, rows));
  const reopened = local.reopen(),
    resumed = await run(reopened.store.activate(account, id(952)));
  const flow = groceryFlow({ store: reopened.store, session: resumed }, groceries);
  const saved = await run(flow.read);
  assert.equal(saved.groceries.length, 4200);
  const target = saved.groceries.at(-1);
  assert.deepEqual(target.mealSource, rows.at(-1).mealSource);
  await run(flow.check(target, true, id(953)));
  await run(flow.sync);
  const checked = (await run(flow.read)).groceries.find((row) => row.itemId === target.itemId);
  assert.equal(checked.checked, true);
  assert.equal(checked.pending, false);
  assert.deepEqual(checked.mealSource, target.mealSource);
});
