import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readPlannedRecipe, plannedRecipeRoute } from "../../apps/api/src/meals/planned-recipe.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" },
  caller = { token: "fixture", member: { userId: id(1), householdId: id(10), displayName: "A" } };
const query = {
  entryId: "ABCDEF00-0000-4000-8000-000000000004",
  weekStart: "2030-01-07",
  revision: "9007199254740993",
};
const entry = {
  entryId: query.entryId.toLowerCase(),
  definitionId: id(200),
  leftoverSourceId: null,
  date: query.weekStart,
  slot: "dinner",
  title: "Original soup",
  recipeUrl: null,
  notes: null,
};
const result = {
  version: 1,
  householdId: id(10),
  weekStart: query.weekStart,
  revision: query.revision,
  entry,
  snapshot: {
    libraryRevision: "1",
    recipe: {
      definitionId: id(200),
      title: "Original soup",
      servings: null,
      instructions: null,
      recipeUrl: null,
      notes: null,
      ingredients: [],
    },
  },
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
test("planned detail binds identity, exact week revision and coherent captured recipe", async () => {
  assert.deepEqual(
    await run(readPlannedRecipe(config, caller, query), async (url, init) => {
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_planned_recipe");
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_week: query.weekStart,
        p_revision: query.revision,
        p_entry: query.entryId.toLowerCase(),
      });
      return Response.json(result);
    }),
    result,
  );
  for (const patch of [
    { householdId: id(20) },
    { revision: "9007199254740992" },
    { weekStart: "2030-01-14" },
    { entry: { ...entry, entryId: id(3) } },
    { entry: { ...entry, date: "2030-01-20" } },
    { snapshot: { ...result.snapshot, recipe: { ...result.snapshot.recipe, title: "Changed" } } },
    {
      snapshot: {
        ...result.snapshot,
        recipe: { ...result.snapshot.recipe, definitionId: id(201) },
      },
    },
    { extra: true },
  ])
    await assert.rejects(
      run(readPlannedRecipe(config, caller, query), async () =>
        Response.json({ ...result, ...patch }),
      ),
      { code: "unavailable" },
    );
  const legacy = { ...result, snapshot: null };
  assert.deepEqual(
    await run(readPlannedRecipe(config, caller, query), async () => Response.json(legacy)),
    legacy,
  );
  const absent = { ...result, entry: null, snapshot: null };
  assert.deepEqual(
    await run(readPlannedRecipe(config, caller, query), async () => Response.json(absent)),
    absent,
  );
});
test("planned detail route rejects duplicate, unknown or incomplete query parameters before dispatch", async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return Response.json(result);
  };
  const base = `http://localhost/v1/meals/planned-recipe?${new URLSearchParams(query)}`;
  for (const url of [
    base + "&revision=1",
    base + "&householdId=" + id(20),
    "http://localhost/v1/meals/planned-recipe?entryId=" + id(1),
  ])
    await assert.rejects(run(plannedRecipeRoute(new Request(url), config, caller), fetch), {
      code: "invalid_request",
    });
  assert.equal(calls, 0);
});
