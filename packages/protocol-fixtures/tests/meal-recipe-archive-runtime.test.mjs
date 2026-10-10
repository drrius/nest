import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { RecipeArchiveRuntime } from "../src/meals/recipe-archive-runtime.ts";
import { recipeArchiveOwner } from "../src/meals/recipe-archive-owner.ts";
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
  revision: "1",
};
const failure = (code = "unavailable") => Effect.fail(new PreferenceFailure({ code }));

test("uncertain archive locks exact target and baseline; retry preserves later restoration", async () => {
  const calls = [];
  let result = failure(),
    current = snapshot(),
    reads = 0;
  const client = {
    library: {
      read: () => Effect.succeed({ revision: current.revision }),
      recipe: (definition, revision) => {
        reads++;
        assert.equal(definition, target.definitionId);
        assert.equal(revision, current.revision);
        return Effect.succeed(current);
      },
    },
    archiveRecipe: (value) => {
      calls.push(value);
      return result;
    },
  };
  const runtime = new RecipeArchiveRuntime(client, target, () => id(800));
  await runtime.load();
  await runtime.save();
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  assert.equal(runtime.getSnapshot().pendingWrite, true);
  current = snapshot("2");
  await runtime.load(true);
  await runtime.save();
  assert.equal(reads, 1);
  assert.equal(calls.length, 1);
  result = Effect.succeed(receipt);
  await runtime.retry();
  assert.deepEqual(calls, [
    { operationId: id(800), ...target },
    { operationId: id(800), ...target },
  ]);
  assert.equal(runtime.getSnapshot().stage, "saved");
  assert.equal(runtime.getSnapshot().snapshot.revision, "2");
  runtime.dispose();
});
test("acknowledged archive never resends after refresh failure and hides revoked content", async () => {
  /** @type {Effect.Effect<ReturnType<typeof snapshot>, PreferenceFailure>} */
  let read = Effect.succeed(snapshot());
  let writes = 0;
  const runtime = new RecipeArchiveRuntime(
    {
      library: { read: () => Effect.succeed({ revision: "1" }), recipe: () => read },
      archiveRecipe: () => {
        writes++;
        read = failure();
        return Effect.succeed(receipt);
      },
    },
    target,
    () => id(800),
  );
  await runtime.load();
  await runtime.save();
  assert.equal(runtime.getSnapshot().stage, "reload");
  await runtime.retry();
  await runtime.save();
  assert.equal(writes, 1);
  read = Effect.succeed(snapshot("0"));
  await runtime.load(true);
  assert.equal(runtime.getSnapshot().stage, "reload");
  read = failure("forbidden");
  await runtime.load(true);
  assert.equal(runtime.getSnapshot().snapshot, null);
  assert.equal(runtime.getSnapshot().receipt, null);
  assert.equal(runtime.getSnapshot().stage, "verify");
  read = failure();
  await runtime.load(true);
  assert.equal(runtime.getSnapshot().stage, "verify");
  runtime.dispose();
});
test("stale archive requires fresh confirmation; absent recipes never dispatch", async () => {
  let current = snapshot(),
    writes = 0;
  const runtime = new RecipeArchiveRuntime(
    {
      library: {
        read: () => Effect.succeed({ revision: current.revision }),
        recipe: () => Effect.succeed(current),
      },
      archiveRecipe: () => {
        writes++;
        return failure("conflict");
      },
    },
    target,
    () => id(800),
  );
  await runtime.load();
  await runtime.save();
  assert.equal(runtime.getSnapshot().snapshot, null);
  await runtime.save();
  assert.equal(writes, 1);
  current = snapshot("1", null);
  await runtime.load(true);
  await runtime.save();
  assert.equal(writes, 1);
  runtime.dispose();
});
test("owner recreates across Strict Mode and disposed pending work never publishes", async () => {
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
  const owner = recipeArchiveOwner(client, target, () => id(800));
  const cleanup = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  const before = first.getSnapshot();
  cleanup();
  finish(snapshot());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(first.getSnapshot(), before);
  assert.equal(owner.getSnapshot(), null);
  const last = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), first);
  finish(snapshot());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(owner.getSnapshot().getSnapshot().snapshot.revision, "0");
  last();
});
