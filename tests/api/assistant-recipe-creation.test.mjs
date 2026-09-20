import { boundedRecipeInput } from "../database/ai-recipe-creation-fixture.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { assistantCommands } from "../../apps/api/src/assistant/commands.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = new Request("http://localhost/", {
  headers: { authorization: "Bearer fixture", "x-nest-household": id(10) },
});
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const turn = {
  conversationId: id(100),
  operationId: id(101),
  expectedRevision: "0",
  text: "Change chore",
};
const execute = assistantCommands(request, config, turn);
const command = {
  expectedRevision: "9007199254740993",
  recipe: {
    title: "Soup",
    servings: 2,
    instructions: "Simmer",
    recipeUrl: null,
    notes: null,
    ingredients: [{ name: "Tomato", quantity: "1/2", unit: "cup", categoryId: null, note: null }],
  },
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(102),
  definitionId: id(105),
  revision: "9007199254740995",
};
function fetcher(value, calls = [], household = id(10)) {
  return async (url, init) => {
    if (new URL(url).pathname === "/auth/v1/user") return Response.json({ id: id(1) });
    if (new URL(url).pathname === "/rest/v1/household_members")
      return Response.json([{ user_id: id(1), household_id: household, display_name: "Fixture" }]);
    calls.push(JSON.parse(init.body));
    return Response.json({ ok: true, value });
  };
}
const run = (tool, input, fetch) =>
  Effect.runPromise(
    execute(tool, input, "change").pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );

test("AI recipe receipt binds account and exact bigint ingredient revision increment", async () => {
  const calls = [];
  assert.deepEqual(await run("createRecipe", command, fetcher(receipt, calls)), receipt);
  assert.equal(calls[0].p_tool, "createRecipe");
  assert.deepEqual(calls[0].p_input, command);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { definitionId: "bad" },
    { revision: "9007199254740994" },
    { hidden: true },
  ])
    await assert.rejects(run("createRecipe", command, fetcher({ ...receipt, ...patch })), {
      code: "unavailable",
    });
});
test("AI recipe creation rejects injected identities and returns native handoff before oversized dispatch", async () => {
  const calls = [];
  for (const patch of [
    { actorId: id(2) },
    { operationId: id(8) },
    { householdId: id(20) },
    { recipe: { ...command.recipe, definitionId: id(5) } },
  ])
    await assert.rejects(run("createRecipe", { ...command, ...patch }, fetcher(receipt, calls)), {
      code: "unavailable",
    });
  const large = {
    ...command,
    recipe: {
      ...command.recipe,
      ingredients: Array.from({ length: 100 }, () => ({
        ...command.recipe.ingredients[0],
        note: "x".repeat(1000),
      })),
    },
  };
  await assert.rejects(run("createRecipe", large, fetcher(receipt, calls)), {
    code: "native_required",
  });
  assert.equal(calls.length, 0);
});

test("native handoff boundary uses actual UTF-8 bytes and does not dispatch over the limit", async () => {
  const calls = [],
    value = boundedRecipeInput();
  assert.deepEqual(
    await run("createRecipe", value, fetcher({ ...receipt, revision: "43" }, calls)),
    { ...receipt, revision: "43" },
  );
  assert.equal(calls.length, 1);
  await assert.rejects(run("createRecipe", boundedRecipeInput(49153), fetcher(receipt, calls)), {
    code: "native_required",
  });
  assert.equal(calls.length, 1);
});
