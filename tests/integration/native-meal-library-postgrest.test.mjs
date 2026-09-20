import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { MealLibraryRuntime } from "../../apps/mobile/src/meals/library-runtime.ts";
import { SavedMealRuntime } from "../../apps/mobile/src/meals/recipe-runtime.ts";
import { mealLibraryFiles, id } from "../database/meal-library-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
async function backend(t) {
  const remote = await postgrestFixture(t, [
    ...mealLibraryFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const handler = createHandler({ url: remote.url, publishableKey: "sb_publishable_fixture" });
  let offline = false;
  const server = nodeServer((request) =>
    offline ? Promise.resolve(new Response(null, { status: 503 })) : handler(request),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const account = { actor: id(1), household: id(10) };
  const client = mealClient(
    `http://127.0.0.1:${server.address().port}/`,
    account,
    Effect.succeed({
      access_token: remote.bearer,
      refresh_token: "fixture",
      user: { id: account.actor },
    }),
  ).library;
  return {
    remote,
    client,
    offline: (value) => {
      offline = value;
    },
  };
}

test("native runtime through real API/PostgREST recovers stale recipe pagination and detail, then hides revoked data", async (t) => {
  const { remote, client } = await backend(t);
  remote.db.sql(
    `insert into public.meal_definitions(id,household_id,name) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(10)}','Recipe '||n from generate_series(1000,1050) n`,
  );
  const library = new MealLibraryRuntime(client);
  t.after(() => library.dispose());
  await library.load();
  assert.equal(library.getSnapshot().meals.length, 50);
  assert.equal(library.getSnapshot().revision, "51");
  remote.db.sql(`update public.meal_grocery_templates set quantity='3' where id='${id(300)}'`);
  await library.more();
  assert.equal(library.getSnapshot().revision, null);
  assert.equal(library.getSnapshot().meals.length, 0);
  assert.match(library.getSnapshot().notice, /library changed/);
  await library.load();
  await library.more();
  assert.equal(library.getSnapshot().revision, "52");
  assert.equal(library.getSnapshot().meals.length, 53);
  assert.equal(library.getSnapshot().nextAfterId, null);
  const recipe = new SavedMealRuntime(client, { definitionId: id(200), expectedRevision: "52" });
  t.after(() => recipe.dispose());
  await recipe.load();
  assert.equal(recipe.getSnapshot().snapshot.recipe.ingredients[0].quantity, "3");
  assert.equal(recipe.getSnapshot().snapshot.recipe.instructions, null);
  remote.db.sql(
    `update public.meal_definitions set nest_servings=4,nest_instructions='Simmer gently' where id='${id(200)}'`,
  );
  await recipe.load();
  assert.equal(recipe.getSnapshot().snapshot, null);
  await recipe.load(true);
  assert.equal(recipe.getSnapshot().snapshot.revision, "53");
  assert.equal(recipe.getSnapshot().snapshot.recipe.instructions, "Simmer gently");
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await library.load();
  await recipe.load();
  assert.equal(library.getSnapshot().access, "verify");
  assert.equal(library.getSnapshot().meals.length, 0);
  assert.equal(recipe.getSnapshot().access, "verify");
  assert.equal(recipe.getSnapshot().snapshot, null);
});

test("native read failure retains clearly stale content and archive reload replaces detail with explicit absence", async (t) => {
  const f = await backend(t);
  const library = new MealLibraryRuntime(f.client);
  const recipe = new SavedMealRuntime(f.client, { definitionId: id(200), expectedRevision: "0" });
  t.after(() => {
    library.dispose();
    recipe.dispose();
  });
  await library.load();
  await recipe.load();
  const prior = recipe.getSnapshot().snapshot;
  f.offline(true);
  await library.load();
  await recipe.load(true);
  assert.equal(library.getSnapshot().meals.length, 2);
  assert.equal(library.getSnapshot().fresh, false);
  assert.deepEqual(recipe.getSnapshot().snapshot, prior);
  assert.equal(recipe.getSnapshot().fresh, false);
  assert.match(recipe.getSnapshot().notice, /may have changed/);
  f.offline(false);
  f.remote.db.sql(`update public.meal_definitions set archived_at=now() where id='${id(200)}'`);
  await recipe.load(true);
  assert.equal(recipe.getSnapshot().snapshot.recipe, null);
  assert.equal(recipe.getSnapshot().fresh, true);
  assert.equal(f.remote.db.sql("select count(*) from public.meal_plan_entries"), "3");
});
