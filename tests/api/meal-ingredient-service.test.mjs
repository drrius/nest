import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readMealIngredients, addMealIngredients } from "../../apps/api/src/meals/ingredients.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const query = { weekStart: "2030-01-07", expectedRevision: "9007199254740993", after: null };
const selected = [
  {
    entryId: "ABCDEF00-0000-4000-8000-000000000100",
    ingredientId: id(300),
    quantity: " ½ ",
    unit: null,
  },
];
const input = {
  operationId: "ABCDEF00-0000-4000-8000-000000000800",
  weekStart: query.weekStart,
  expectedRevision: query.expectedRevision,
  selected,
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: input.operationId.toLowerCase(),
  weekStart: query.weekStart,
  weekRevision: query.expectedRevision,
  ingredients: [
    {
      entryId: selected[0].entryId.toLowerCase(),
      ingredientId: id(300),
      itemId: id(500),
      outcome: "added",
    },
  ],
};
const page = {
  version: 1,
  householdId: id(10),
  weekStart: query.weekStart,
  revision: query.expectedRevision,
  skipped: [],
  nextAfter: null,
  ingredients: [
    {
      ...selected[0],
      entryId: selected[0].entryId.toLowerCase(),
      mealTitle: "Soup",
      date: query.weekStart,
      slot: "dinner",
      name: "Tomatoes",
      categoryId: null,
      groceryItemId: null,
    },
  ],
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));

test("ingredient adapter binds caller and canonical source IDs while retaining exact reviewed text", async () => {
  assert.deepEqual(
    await run(addMealIngredients(config, caller, input), async (url, init) => {
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_add_meal_ingredients");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_operation: input.operationId.toLowerCase(),
        p_input: {
          weekStart: input.weekStart,
          expectedRevision: input.expectedRevision,
          selected: [{ ...selected[0], entryId: selected[0].entryId.toLowerCase() }],
        },
      });
      return Response.json(receipt);
    }),
    receipt,
  );
});
test("ingredient adapter refuses forged receipt owners, baselines, sources or merged grocery mappings", async () => {
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(801) },
    { weekStart: "2030-01-14" },
    { weekRevision: "9007199254740994" },
    { ingredients: [] },
    { ingredients: [{ ...receipt.ingredients[0], ingredientId: id(301) }] },
    { private: "excess" },
  ])
    await assert.rejects(
      run(addMealIngredients(config, caller, input), async () =>
        Response.json({ ...receipt, ...patch }),
      ),
      (e) => e.code === "unavailable",
    );
  const two = { ...input, selected: [...selected, { ...selected[0], ingredientId: id(301) }] };
  const mappings = [receipt.ingredients[0], { ...receipt.ingredients[0], ingredientId: id(301) }];
  for (const ingredients of [mappings, [{ ...mappings[1], itemId: id(501) }, mappings[0]]])
    await assert.rejects(
      run(addMealIngredients(config, caller, two), async () =>
        Response.json({ ...receipt, ingredients }),
      ),
      (e) => e.code === "unavailable",
    );
});
test("ingredient read rejects misbound pages and cursor regression without pretending pagination completed", async () => {
  assert.deepEqual(
    await run(readMealIngredients(config, caller, query), async () => Response.json(page)),
    page,
  );
  for (const patch of [
    { householdId: id(20) },
    { weekStart: "2030-01-14" },
    { revision: "0" },
    { nextAfter: selected[0] },
    { ingredients: [...page.ingredients, ...page.ingredients] },
  ])
    await assert.rejects(
      run(readMealIngredients(config, caller, query), async () =>
        Response.json({ ...page, ...patch }),
      ),
      (e) => e.code === "unavailable",
    );
  const after = { entryId: selected[0].entryId, ingredientId: selected[0].ingredientId };
  await assert.rejects(
    run(readMealIngredients(config, caller, { ...query, after }), async () => Response.json(page)),
    (e) => e.code === "unavailable",
  );
});
test("injected ingredient commands fail before dispatch; conflict and authorization remain distinct", async () => {
  let calls = 0;
  for (const patch of [
    { actorId: id(2) },
    { selected: [{ ...selected[0], name: "Injected" }] },
    { selected: [...selected, ...selected] },
  ])
    await assert.rejects(
      run(addMealIngredients(config, caller, { ...input, ...patch }), async () => {
        calls++;
        return Response.json(receipt);
      }),
      (e) => e.code === "invalid_request",
    );
  assert.equal(calls, 0);
  for (const [code, status, expected] of [
    ["40001", 409, "conflict"],
    ["42501", 403, "forbidden"],
    ["22023", 400, "invalid_request"],
  ])
    await assert.rejects(
      run(addMealIngredients(config, caller, input), async () =>
        Response.json({ code }, { status }),
      ),
      (e) => e.code === expected,
    );
});
