import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { RecipeCreationRuntime } from "../src/meals/recipe-creation-runtime.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const recipe = () => ({
  title: "Soup",
  servings: 2,
  instructions: "Simmer",
  recipeUrl: null,
  notes: null,
  ingredients: [{ name: "Tomato", quantity: "1/2", unit: "cup", categoryId: null, note: null }],
});
const page = (revision = "0") => ({
  version: 1,
  householdId: id(10),
  revision,
  meals: [],
  nextAfterId: null,
});
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(20),
  definitionId: id(30),
  revision: "2",
};
const failure = (code = "unavailable") => Effect.fail(new PreferenceFailure({ code }));

test("uncertain creation copies nested draft and retries original identity and revision", async () => {
  const calls = [];
  let response = failure(),
    reads = 0;
  const runtime = new RecipeCreationRuntime(
    {
      library: {
        read: () => {
          reads++;
          return Effect.succeed(page(reads > 1 ? "3" : "0"));
        },
      },
      createRecipe: (input) => {
        calls.push(input);
        return response;
      },
    },
    () => id(20),
  );
  await runtime.load();
  const draft = recipe();
  await runtime.save(draft);
  draft.ingredients[0].name = "Changed";
  draft.title = "Changed";
  await runtime.load();
  await runtime.save(draft);
  assert.equal(reads, 1);
  assert.equal(calls.length, 1);
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  assert.equal(runtime.getSnapshot().pendingWrite, true);
  response = Effect.succeed(receipt);
  await runtime.retry();
  assert.deepEqual(calls[0], { operationId: id(20), expectedRevision: "0", recipe: recipe() });
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(runtime.getSnapshot().revision, "3");
  runtime.dispose();
});

test("acknowledged creation refresh never resubmits, and revoked access clears receipt", async () => {
  /** @type {Effect.Effect<ReturnType<typeof page>, PreferenceFailure>} */
  let read = Effect.succeed(page());
  let writes = 0;
  const runtime = new RecipeCreationRuntime(
    {
      library: { read: () => read },
      createRecipe: () => {
        writes++;
        read = failure();
        return Effect.succeed(receipt);
      },
    },
    () => id(20),
  );
  await runtime.load();
  await runtime.save(recipe());
  assert.equal(runtime.getSnapshot().stage, "reload");
  await runtime.retry();
  await runtime.save(recipe());
  assert.equal(writes, 1);
  read = Effect.succeed(page("1"));
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "reload");
  read = failure("forbidden");
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "verify");
  assert.equal(runtime.getSnapshot().receipt, null);
  assert.equal(runtime.getSnapshot().revision, null);
  read = failure();
  await runtime.load();
  assert.equal(runtime.getSnapshot().stage, "verify");
  runtime.dispose();
});

test("invalid drafts never dispatch and disposed writes cannot publish late success", async () => {
  let finish,
    writes = 0;
  const runtime = new RecipeCreationRuntime(
    {
      library: { read: () => Effect.succeed(page()) },
      createRecipe: () => {
        writes++;
        return Effect.promise(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        );
      },
    },
    () => id(20),
  );
  await runtime.load();
  await runtime.save({ ...recipe(), servings: 0 });
  assert.equal(writes, 0);
  const pending = runtime.save(recipe());
  await new Promise((resolve) => setImmediate(resolve));
  const before = runtime.getSnapshot();
  runtime.dispose();
  finish(receipt);
  await pending;
  assert.equal(runtime.getSnapshot(), before);
});
