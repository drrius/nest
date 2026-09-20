import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  mealLibraryRoute,
  readMealLibrary,
  readSavedMeal,
} from "../../apps/api/src/meals/library-read.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `abcdef00-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const revision = "9007199254740993";
const page = {
  version: 1,
  householdId: id(10),
  revision,
  meals: [{ definitionId: id(21), title: "Soup", servings: null }],
  nextAfterId: null,
};
const detail = {
  version: 1,
  householdId: id(10),
  revision,
  recipe: { ...page.meals[0], recipeUrl: null, notes: null, instructions: null, ingredients: [] },
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));

test("library adapters bind current household, exact bigint revision and canonical UUID through one RPC", async () => {
  let calls = 0;
  const input = { afterId: id(20).toUpperCase(), expectedRevision: revision };
  assert.deepEqual(
    await run(readMealLibrary(config, caller, input), async (url, init) => {
      calls++;
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_meal_library_page");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_after: id(20),
        p_expected: revision,
      });
      return Response.json(page);
    }),
    page,
  );
  assert.deepEqual(
    await run(
      readSavedMeal(config, caller, {
        definitionId: id(21).toUpperCase(),
        expectedRevision: revision,
      }),
      async (url, init) => {
        calls++;
        assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_saved_meal");
        assert.deepEqual(JSON.parse(init.body), {
          p_household: id(10),
          p_definition: id(21),
          p_expected: revision,
        });
        return Response.json(detail);
      },
    ),
    detail,
  );
  assert.equal(calls, 2);
});

test("malformed, hidden-identity, duplicate and missing read parameters fail before transport", async () => {
  for (const query of [
    "afterId=bad",
    "afterId=" + id(20),
    "expectedRevision=01",
    "expectedRevision=0&expectedRevision=0",
    "householdId=" + id(10),
    "actorId=" + id(1),
  ]) {
    await assert.rejects(
      run(
        mealLibraryRoute(new Request(`http://localhost/v1/meals/library?${query}`), config, caller),
        () => assert.fail("dispatched"),
      ),
      { code: "invalid_request" },
    );
  }
  for (const query of [
    "",
    "definitionId=" + id(21),
    "expectedRevision=0",
    `definitionId=${id(21)}&expectedRevision=0&definitionId=${id(21)}`,
    `definitionId=${id(21)}&expectedRevision=0&hidden=true`,
  ]) {
    await assert.rejects(
      run(
        mealLibraryRoute(new Request(`http://localhost/v1/meals/recipe?${query}`), config, caller),
        () => assert.fail("dispatched"),
      ),
      { code: "invalid_request" },
    );
  }
  await assert.rejects(
    run(
      readMealLibrary(config, caller, {
        afterId: null,
        expectedRevision: null,
        householdId: id(20),
      }),
      () => assert.fail("dispatched"),
    ),
    { code: "invalid_request" },
  );
  await assert.rejects(
    run(
      readSavedMeal(config, caller, {
        definitionId: id(21),
        expectedRevision: revision,
        actorId: id(2),
      }),
      () => assert.fail("dispatched"),
    ),
    { code: "invalid_request" },
  );
});

test("wrong-scope, wrong-revision, repeated-page and substituted-recipe responses are unavailable", async () => {
  const input = { afterId: id(20), expectedRevision: revision };
  for (const patch of [
    { householdId: id(20) },
    { revision: "0" },
    { privateTranscript: "hidden" },
    { meals: [{ ...page.meals[0], definitionId: id(20) }] },
    { meals: [...page.meals, ...page.meals] },
  ]) {
    await assert.rejects(
      run(readMealLibrary(config, caller, input), async () => Response.json({ ...page, ...patch })),
      { code: "unavailable" },
    );
  }
  const recipeInput = { definitionId: id(21), expectedRevision: revision };
  for (const patch of [
    { householdId: id(20) },
    { revision: "0" },
    { recipe: { ...detail.recipe, definitionId: id(22) } },
    { recipe: { ...detail.recipe, hidden: true } },
  ]) {
    await assert.rejects(
      run(readSavedMeal(config, caller, recipeInput), async () =>
        Response.json({ ...detail, ...patch }),
      ),
      { code: "unavailable" },
    );
  }
  assert.deepEqual(
    await run(readSavedMeal(config, caller, recipeInput), async () =>
      Response.json({ ...detail, recipe: null }),
    ),
    { ...detail, recipe: null },
  );
});

test("database conflicts and permission loss propagate honestly rather than become empty libraries", async () => {
  for (const read of [
    () => readMealLibrary(config, caller, { afterId: null, expectedRevision: revision }),
    () => readSavedMeal(config, caller, { definitionId: id(21), expectedRevision: revision }),
  ]) {
    for (const [sqlCode, status, expected] of [
      ["40001", 409, "conflict"],
      ["42501", 403, "forbidden"],
      ["22023", 400, "invalid_request"],
    ]) {
      await assert.rejects(
        run(read(), async () => Response.json({ code: sqlCode }, { status })),
        { code: expected },
      );
    }
  }
});
