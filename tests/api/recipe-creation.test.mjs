import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createRecipe } from "../../apps/api/src/meals/recipe-creation.ts";
import { input, id } from "../database/recipe-creation-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const command = {
  ...input("9007199254740993"),
  operationId: "ABCDEF00-0000-4000-8000-000000000001",
};
command.recipe.ingredients[0].categoryId = "ABCDEF00-0000-4000-8000-000000000002";
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: command.operationId.toLowerCase(),
  definitionId: id(100),
  revision: "9007199254740996",
};
const run = (value, fetch) =>
  Effect.runPromise(
    createRecipe(config, caller, value).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );

test("recipe creation canonicalizes retry/category identities and binds exact bigint result", async () => {
  assert.deepEqual(
    await run(command, async (url, init) => {
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_create_recipe");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      const payload = structuredClone(command);
      delete payload.operationId;
      payload.recipe.ingredients[0].categoryId =
        payload.recipe.ingredients[0].categoryId.toLowerCase();
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_operation: command.operationId.toLowerCase(),
        p_input: payload,
      });
      return Response.json(receipt);
    }),
    receipt,
  );
});

test("recipe creation rejects nested identity injection and invalid drafts before dispatch", async () => {
  const invalid = [
    { ...command, actorId: id(2) },
    { ...command, expectedRevision: 1 },
    { ...command, recipe: { ...command.recipe, definitionId: id(100) } },
    { ...command, recipe: { ...command.recipe, title: " " } },
    {
      ...command,
      recipe: { ...command.recipe, ingredients: [{ ...command.recipe.ingredients[0], id: id(5) }] },
    },
  ];
  for (const value of invalid)
    await assert.rejects(
      run(value, () => {
        assert.fail("Invalid command dispatched");
      }),
      (e) => e.code === "invalid_request",
    );
});

test("recipe receipts reject substitutions and preserve upstream failure categories", async () => {
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(5) },
    { definitionId: "bad" },
    { revision: "9007199254740995" },
    { private: true },
  ])
    await assert.rejects(
      run(command, async () => Response.json({ ...receipt, ...patch })),
      (e) => e.code === "unavailable",
    );
  for (const [code, status, expected] of [
    ["40001", 409, "conflict"],
    ["42501", 403, "forbidden"],
    ["22023", 400, "invalid_request"],
  ])
    await assert.rejects(
      run(command, async () => Response.json({ code }, { status })),
      (e) => e.code === expected,
    );
});
