import {
  recipeEditChanges,
  metadataFields,
  editorIngredients,
  keepIngredient,
  ingredientFields,
  moveEditorIngredient,
} from "../../apps/mobile/src/meals/recipe-edit-draft.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { RecipeEditRuntime } from "../../apps/mobile/src/meals/recipe-edit-runtime.ts";
import { recipeCreationFiles, id } from "../database/recipe-creation-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
async function backend(t, lost = false) {
  const remote = await postgrestFixture(t, [
    ...recipeCreationFiles,
    "supabase/migrations/20260921002813_native_recipe_edit.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  const proxy = lost
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_edit_recipe")
    : null;
  const server = nodeServer(
    createHandler({ url: proxy?.url ?? remote.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const client = mealClient(
    `http://127.0.0.1:${server.address().port}/`,
    { actor: id(1), household: id(10) },
    Effect.succeed({ access_token: remote.bearer, refresh_token: "fixture", user: { id: id(1) } }),
  );
  const runtime = new RecipeEditRuntime(
    client,
    { definitionId: id(200), expectedRevision: "0" },
    () => id(800),
  );
  t.after(() => runtime.dispose());
  return { remote, client, runtime };
}

test("native edit preserves exact changes after lost response and later partner archive", async (t) => {
  const { remote, client, runtime } = await backend(t, true);
  await runtime.load();
  const recipe = runtime.getSnapshot().snapshot.recipe,
    items = editorIngredients(recipe);
  items[0] = keepIngredient(items[0], { ...ingredientFields(items[0]), note: "Chopped finely" });
  const changes = recipeEditChanges(
    recipe,
    { ...metadataFields(recipe), instructions: "Simmer gently" },
    moveEditorIngredient(items, 0, 1),
  );
  await runtime.save(changes);
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  const receipt = JSON.parse(remote.db.sql("select result from public.nest_recipe_edit_receipts"));
  assert.equal(receipt.previousRevision, "0");
  assert.equal(receipt.revision, "3");
  changes.patch.instructions = "Never resend this";
  remote.db.sql(
    `update public.meal_definitions set name='Partner archived',archived_at=now() where id='${id(200)}'`,
  );
  await runtime.retry();
  const view = runtime.getSnapshot();
  assert.equal(view.stage, "saved");
  assert.deepEqual(view.receipt, receipt);
  assert.equal(view.snapshot.revision, "4");
  assert.equal(view.snapshot.recipe, null);
  assert.equal(
    remote.db.sql(`select nest_instructions from public.meal_definitions where id='${id(200)}'`),
    "Simmer gently",
  );
  assert.equal(
    remote.db.sql(
      `select count(*) from public.meal_grocery_templates where meal_definition_id='${id(200)}'`,
    ),
    "2",
  );
  assert.equal(
    remote.db.sql(
      `select quantity||':'||unit from public.meal_grocery_templates where id='${id(300)}'`,
    ),
    "1/2:cup",
  );
  assert.equal(remote.db.sql("select count(*) from public.nest_recipe_edit_receipts"), "1");
  const library = await Effect.runPromise(client.library.read());
  assert.equal(
    library.meals.some((meal) => meal.definitionId === id(200)),
    false,
  );
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await runtime.load(true);
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().snapshot, null);
});
test("native conflict retains readonly draft baseline and a fresh confirmed edit preserves partner changes", async (t) => {
  const { remote, runtime } = await backend(t);
  await runtime.load();
  const recipe = runtime.getSnapshot().snapshot.recipe;
  const changes = recipeEditChanges(
    recipe,
    { ...metadataFields(recipe), notes: "Draft note" },
    editorIngredients(recipe),
  );
  remote.db.sql(`update public.meal_definitions set name='Partner changed' where id='${id(200)}'`);
  await runtime.save(changes);
  assert.equal(runtime.getSnapshot().stage, "reload");
  assert.equal(runtime.getSnapshot().snapshot.recipe.title, "Legacy soup");
  await runtime.retry();
  await runtime.save(changes);
  assert.equal(remote.db.sql("select count(*) from public.nest_recipe_edit_receipts"), "0");
  await runtime.load(true);
  assert.equal(runtime.getSnapshot().generation, 2);
  const current = runtime.getSnapshot().snapshot.recipe;
  assert.equal(current.title, "Partner changed");
  await runtime.save(
    recipeEditChanges(
      current,
      { ...metadataFields(current), notes: "Reviewed new note" },
      editorIngredients(current),
    ),
  );
  const view = runtime.getSnapshot();
  assert.equal(view.stage, "saved");
  assert.equal(view.snapshot.recipe.title, "Partner changed");
  assert.equal(view.snapshot.recipe.notes, "Reviewed new note");
  assert.equal(view.snapshot.recipe.servings, null);
  assert.equal(view.snapshot.recipe.instructions, null);
  assert.equal(view.receipt.revision, "2");
});
