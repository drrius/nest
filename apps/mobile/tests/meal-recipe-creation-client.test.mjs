import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mealClient } from "../src/meals/client.ts";
import { recipeCreationOwner } from "../src/meals/recipe-creation-owner.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const client = mealClient(
  "http://localhost/",
  account,
  Effect.succeed({ user: { id: id(1) }, access_token: "fixture", refresh_token: "fixture" }),
);
const command = {
  operationId: id(20),
  expectedRevision: "9007199254740993",
  recipe: {
    title: "Soup",
    servings: 2,
    instructions: "Simmer",
    recipeUrl: null,
    notes: null,
    ingredients: [{ name: "Tomatoes", quantity: "1/2", unit: "cup", note: null, categoryId: null }],
  },
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(20),
  definitionId: id(30),
  revision: "9007199254740995",
};
const run = (body, fetch) =>
  Effect.runPromise(
    client.createRecipe(body).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );

test("native creation sends authenticated exact draft and rejects substituted receipts", async () => {
  assert.deepEqual(
    await run(command, async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/recipe/create");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      assert.equal(new Headers(init.headers).get("x-nest-household"), id(10));
      assert.deepEqual(JSON.parse(init.body), command);
      return Response.json({ version: 1, receipt });
    }),
    receipt,
  );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(21) },
    { revision: "9007199254740994" },
    { definitionId: "bad" },
  ])
    await assert.rejects(
      run(command, async () => Response.json({ version: 1, receipt: { ...receipt, ...patch } })),
      (e) => e.code === "unavailable",
    );
  await assert.rejects(
    run({ ...command, actorId: id(2) }, () => assert.fail("Invalid command sent")),
    (e) => e.code === "invalid",
  );
});

test("creation owner recreates after Strict Mode cleanup and loads only live runtime", async () => {
  let reads = 0;
  const owner = recipeCreationOwner(
    {
      library: {
        read: () => {
          reads++;
          return Effect.succeed({ revision: "0" });
        },
      },
    },
    () => id(20),
  );
  const unsubscribe = owner.subscribe(() => {});
  const first = owner.getSnapshot();
  unsubscribe();
  assert.equal(owner.getSnapshot(), null);
  const final = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), first);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(owner.getSnapshot().getSnapshot().revision, "0");
  assert.equal(reads, 2);
  final();
});
