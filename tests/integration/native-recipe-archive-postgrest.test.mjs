import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { RecipeArchiveRuntime } from "../../apps/mobile/src/meals/recipe-archive-runtime.ts";
import { recipeCreationFiles, id } from "../database/recipe-creation-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
async function backend(t, lost = false) {
  const remote = await postgrestFixture(t, [
    ...recipeCreationFiles,
    "supabase/migrations/20260920235917_native_recipe_archive.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  const proxy = lost
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_archive_recipe")
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
  const runtime = new RecipeArchiveRuntime(
    client,
    { definitionId: id(200), expectedRevision: "0" },
    () => id(800),
  );
  t.after(() => runtime.dispose());
  return { remote, client, runtime };
}

test("native archive retries original receipt after restoration without hiding the restored recipe", async (t) => {
  const { remote, client, runtime } = await backend(t, true);
  await runtime.load();
  await runtime.save();
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  const receipt = JSON.parse(
    remote.db.sql("select result from public.nest_recipe_archive_receipts"),
  );
  assert.equal(receipt.revision, "1");
  remote.db.sql(
    `update public.meal_definitions set name='Partner restored',archived_at=null where id='${id(200)}'`,
  );
  await runtime.retry();
  const view = runtime.getSnapshot();
  assert.equal(view.stage, "saved");
  assert.deepEqual(view.receipt, receipt);
  assert.equal(view.snapshot.revision, "2");
  assert.equal(view.snapshot.recipe.title, "Partner restored");
  const library = await Effect.runPromise(client.library.read());
  assert.equal(
    library.meals.some((meal) => meal.definitionId === id(200)),
    true,
  );
  assert.equal(remote.db.sql("select count(*) from public.nest_recipe_archive_receipts"), "1");
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await runtime.load(true);
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().snapshot, null);
});
test("native stale archive reloads and confirms the changed recipe before hiding it", async (t) => {
  const { remote, client, runtime } = await backend(t);
  await runtime.load();
  remote.db.sql(`update public.meal_definitions set name='Partner changed' where id='${id(200)}'`);
  await runtime.save();
  assert.equal(runtime.getSnapshot().stage, "reload");
  assert.equal(runtime.getSnapshot().snapshot, null);
  await runtime.retry();
  assert.equal(remote.db.sql("select count(*) from public.nest_recipe_archive_receipts"), "0");
  await runtime.load(true);
  assert.equal(runtime.getSnapshot().snapshot.recipe.title, "Partner changed");
  await runtime.save();
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(runtime.getSnapshot().snapshot.recipe, null);
  assert.equal(runtime.getSnapshot().receipt.revision, "2");
  const library = await Effect.runPromise(client.library.read());
  assert.equal(
    library.meals.some((meal) => meal.definitionId === id(200)),
    false,
  );
});
