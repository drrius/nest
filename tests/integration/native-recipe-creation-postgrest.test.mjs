import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { RecipeCreationRuntime } from "../../apps/mobile/src/meals/recipe-creation-runtime.ts";
import { recipeCreationFiles, input, id } from "../database/recipe-creation-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
async function backend(t, lost = false) {
  const remote = await postgrestFixture(t, [
    ...recipeCreationFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const proxy = lost
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_create_recipe")
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
  const runtime = new RecipeCreationRuntime(client, () => id(800));
  t.after(() => runtime.dispose());
  return { remote, client, runtime };
}

test("native recipe creation recovers lost receipt after partner edit with original ordered quantities", async (t) => {
  const { remote, client, runtime } = await backend(t, true);
  await runtime.load();
  await runtime.save(input().recipe);
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  const receipt = JSON.parse(
    remote.db.sql("select result from public.nest_recipe_creation_receipts"),
  );
  remote.db.sql(
    `update public.meal_definitions set name='Partner soup' where id='${receipt.definitionId}'`,
  );
  await runtime.retry();
  const view = runtime.getSnapshot();
  assert.equal(view.stage, "saved");
  assert.deepEqual(view.receipt, receipt);
  assert.equal(view.revision, "4");
  const saved = await Effect.runPromise(client.library.recipe(receipt.definitionId, view.revision));
  assert.equal(saved.recipe.title, "Partner soup");
  assert.deepEqual(
    saved.recipe.ingredients.map(({ quantity, unit }) => [quantity, unit]),
    [
      ["1/2", "cup"],
      ["250", "g"],
    ],
  );
  assert.equal(saved.recipe.instructions, input().recipe.instructions);
  assert.equal(saved.recipe.servings, 2);
  assert.equal(remote.db.sql("select count(*) from public.nest_recipe_creation_receipts"), "1");
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().receipt, null);
});

test("native stale library save requires reload and a new command before creation", async (t) => {
  const { remote, runtime } = await backend(t);
  await runtime.load();
  remote.db.sql(`update public.meal_definitions set name='Partner edit' where id='${id(200)}'`);
  await runtime.save(input().recipe);
  assert.equal(runtime.getSnapshot().stage, "reload");
  assert.equal(runtime.getSnapshot().pendingWrite, false);
  assert.equal(remote.db.sql("select count(*) from public.nest_recipe_creation_receipts"), "0");
  await runtime.retry();
  await runtime.load();
  await runtime.save(input().recipe);
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(runtime.getSnapshot().receipt.revision, "4");
});
