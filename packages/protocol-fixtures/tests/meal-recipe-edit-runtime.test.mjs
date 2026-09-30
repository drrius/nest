import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { RecipeEditRuntime } from "../src/meals/recipe-edit-runtime.ts";
import { recipeEditOwner } from "../src/meals/recipe-edit-owner.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = { definitionId: id(200), expectedRevision: "0" };
const snapshot = (revision = "0", recipe = { definitionId: id(200), title: "Soup" }) => ({
  version: 1,
  householdId: id(10),
  revision,
  recipe,
});
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(800),
  definitionId: id(200),
  previousRevision: "0",
  revision: "1",
};
const failure = (code = "unavailable") => Effect.fail(new PreferenceFailure({ code }));
const changes = () => ({
  patch: { title: "Edited" },
  ingredients: [{ kind: "existing", ingredientId: id(300), patch: { quantity: "1/2" } }],
});
test("uncertain edit deeply retains exact payload and blocks new writes/reloads before retry", async () => {
  const calls = [],
    value = changes();
  let current = snapshot(),
    result = failure(),
    reads = 0;
  const runtime = new RecipeEditRuntime(
    {
      library: {
        read: () => Effect.succeed({ revision: current.revision }),
        recipe: () => {
          reads++;
          return Effect.succeed(current);
        },
      },
      editRecipe: (input) => {
        calls.push(input);
        return result;
      },
    },
    target,
    () => id(800),
  );
  await runtime.load();
  await runtime.save(value);
  const original = structuredClone(calls[0]);
  value.patch.title = "Do not resend";
  value.ingredients[0].patch.quantity = "999";
  current = snapshot("2", null);
  await runtime.load(true);
  await runtime.save(changes());
  assert.equal(reads, 1);
  assert.equal(calls.length, 1);
  assert.equal(runtime.getSnapshot().pendingWrite, true);
  result = Effect.succeed(receipt);
  await runtime.retry();
  assert.deepEqual(calls, [original, original]);
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(runtime.getSnapshot().snapshot.recipe, null);
  assert.equal(runtime.getSnapshot().generation, 2);
  runtime.dispose();
});
test("acknowledged refresh failure never resends; older snapshots fail and authorization loss stays hidden", async () => {
  /** @type {Effect.Effect<ReturnType<typeof snapshot>, PreferenceFailure>} */
  let read = Effect.succeed(snapshot());
  let writes = 0;
  const runtime = new RecipeEditRuntime(
    {
      library: { read: () => Effect.succeed({ revision: "1" }), recipe: () => read },
      editRecipe: () => {
        writes++;
        read = failure();
        return Effect.succeed(receipt);
      },
    },
    target,
    () => id(800),
  );
  await runtime.load();
  await runtime.save(changes());
  assert.equal(runtime.getSnapshot().stage, "reload");
  await runtime.retry();
  await runtime.save(changes());
  assert.equal(writes, 1);
  read = Effect.succeed(snapshot("0"));
  await runtime.load(true);
  assert.equal(runtime.getSnapshot().stage, "reload");
  read = failure("forbidden");
  await runtime.load(true);
  assert.equal(runtime.getSnapshot().snapshot, null);
  assert.equal(runtime.getSnapshot().receipt, null);
  read = failure();
  await runtime.load(true);
  assert.equal(runtime.getSnapshot().stage, "verify");
  runtime.dispose();
});
test("conflict keeps a readonly baseline until explicit reload resets its generation; invalid input never dispatches", async () => {
  let current = snapshot(),
    writes = 0;
  const runtime = new RecipeEditRuntime(
    {
      library: {
        read: () => Effect.succeed({ revision: current.revision }),
        recipe: () => Effect.succeed(current),
      },
      editRecipe: () => {
        writes++;
        return failure("conflict");
      },
    },
    target,
    () => id(800),
  );
  await runtime.load();
  await runtime.save({ ...changes(), actorId: id(2) });
  await runtime.save({ patch: {}, ingredients: null });
  assert.equal(writes, 0);
  await runtime.save(changes());
  assert.equal(runtime.getSnapshot().stage, "reload");
  assert.equal(runtime.getSnapshot().snapshot.recipe.title, "Soup");
  assert.equal(runtime.getSnapshot().generation, 1);
  await runtime.save(changes());
  assert.equal(writes, 1);
  await runtime.load(true);
  assert.equal(runtime.getSnapshot().generation, 2);
  current = snapshot("1", null);
  await runtime.load(true);
  await runtime.save(changes());
  assert.equal(writes, 1);
  runtime.dispose();
});
test("Strict Mode owner recreation aborts abandoned work and suppresses late publication", async () => {
  let finish;
  const client = {
    library: {
      recipe: () =>
        Effect.promise(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        ),
    },
  };
  const owner = recipeEditOwner(client, target, () => id(800));
  const cleanup = owner.subscribe(() => {}),
    first = owner.getSnapshot(),
    before = first.getSnapshot();
  cleanup();
  finish(snapshot());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(first.getSnapshot(), before);
  assert.equal(owner.getSnapshot(), null);
  const last = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), first);
  finish(snapshot());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(owner.getSnapshot().getSnapshot().generation, 1);
  last();
});
