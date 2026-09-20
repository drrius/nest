import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { MealLibraryRuntime } from "../src/meals/library-runtime.ts";
import { SavedMealRuntime, savedMealTarget } from "../src/meals/recipe-runtime.ts";
import { mealLibraryOwner, savedMealOwner } from "../src/meals/library-owner.ts";
import { page, recipe, id, target } from "./meal-library-fixture.mjs";
const failed = (code) => Effect.fail(new PreferenceFailure({ code }));

test("pagination retains one exact library revision and never appends after an ingredient conflict", async () => {
  const calls = [];
  /** @type {Effect.Effect<ReturnType<typeof page>, PreferenceFailure>} */
  let response = Effect.succeed(page("0", 1, 50, true));
  const runtime = new MealLibraryRuntime({
    read: (...args) => {
      calls.push(args);
      return response;
    },
  });
  await runtime.load();
  response = Effect.succeed(page("0", 51, 50, true));
  await runtime.more();
  assert.deepEqual(calls, [
    [null, null],
    [id(50), "0"],
  ]);
  assert.equal(runtime.getSnapshot().meals.length, 100);
  response = failed("conflict");
  await runtime.more();
  assert.equal(runtime.getSnapshot().meals.length, 0);
  assert.equal(runtime.getSnapshot().revision, null);
  assert.match(runtime.getSnapshot().notice, /library changed/);
  await runtime.more();
  assert.equal(calls.length, 3);
  response = Effect.succeed(page("3", 1, 0));
  await runtime.load();
  assert.equal(runtime.getSnapshot().revision, "3");
  assert.equal(runtime.getSnapshot().fresh, true);
  runtime.dispose();
});

test("library distinguishes failure from loaded empty and hides retained content after authorization denial", async () => {
  let response = failed("unavailable");
  const runtime = new MealLibraryRuntime({ read: () => response });
  await runtime.load();
  assert.equal(runtime.getSnapshot().revision, null);
  response = Effect.succeed(page());
  await runtime.load();
  response = failed("unavailable");
  await runtime.load();
  assert.equal(runtime.getSnapshot().meals.length, 2);
  assert.equal(runtime.getSnapshot().fresh, false);
  response = failed("forbidden");
  await runtime.load();
  assert.equal(runtime.getSnapshot().meals.length, 0);
  assert.equal(runtime.getSnapshot().access, "verify");
  response = failed("unavailable");
  await runtime.load();
  assert.equal(runtime.getSnapshot().access, "verify");
  response = Effect.succeed(page("2", 1, 0));
  await runtime.load();
  assert.equal(runtime.getSnapshot().access, "ready");
  assert.equal(runtime.getSnapshot().revision, "2");
  runtime.dispose();
});

test("late superseded or disposed library loads cannot overwrite the current account view", async () => {
  let resolve;
  const old = new Promise((done) => {
    resolve = done;
  });
  let response = Effect.promise(() => old);
  const runtime = new MealLibraryRuntime({ read: () => response });
  const pending = runtime.load();
  response = Effect.succeed(page("2"));
  await runtime.load();
  resolve(page("0"));
  await pending;
  assert.equal(runtime.getSnapshot().revision, "2");
  let finish;
  response = Effect.promise(
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  const late = runtime.load();
  runtime.dispose();
  finish(page("3"));
  await late;
  assert.equal(runtime.getSnapshot().revision, "2");
});

test("recipe refresh gets a new exact baseline; conflicts clear old details and null means archived", async () => {
  const calls = [];
  /** @type {Effect.Effect<ReturnType<typeof recipe>, PreferenceFailure>} */
  let response = Effect.succeed(recipe());
  const runtime = new SavedMealRuntime(
    {
      read: () => Effect.succeed(page("3")),
      recipe: (...args) => {
        calls.push(args);
        return response;
      },
    },
    target,
  );
  await runtime.load();
  assert.equal(runtime.getSnapshot().snapshot.recipe.notes, "Old note");
  response = failed("conflict");
  await runtime.load();
  assert.equal(runtime.getSnapshot().snapshot, null);
  response = Effect.succeed({ ...recipe("3"), recipe: null });
  await runtime.load(true);
  assert.deepEqual(calls, [
    [id(1), "0"],
    [id(1), "0"],
    [id(1), "3"],
  ]);
  assert.equal(runtime.getSnapshot().snapshot.recipe, null);
  assert.equal(runtime.getSnapshot().fresh, true);
  runtime.dispose();
});

test("recipe denial clears private data and cancellation stops a dependent detail request after revision refresh", async () => {
  /** @type {Effect.Effect<ReturnType<typeof recipe>, PreferenceFailure>} */
  let response = Effect.succeed(recipe());
  let resolve;
  let reads = 0;
  const runtime = new SavedMealRuntime(
    {
      read: () =>
        Effect.promise(
          () =>
            new Promise((done) => {
              resolve = done;
            }),
        ),
      recipe: () => {
        reads++;
        return response;
      },
    },
    target,
  );
  await runtime.load();
  response = failed("session");
  await runtime.load();
  assert.equal(runtime.getSnapshot().snapshot, null);
  assert.equal(runtime.getSnapshot().access, "verify");
  response = failed("unavailable");
  await runtime.load();
  assert.equal(runtime.getSnapshot().access, "verify");
  const pending = runtime.load(true);
  runtime.cancel();
  resolve(page("4"));
  await pending;
  assert.equal(reads, 3);
  assert.equal(runtime.getSnapshot().snapshot, null);
  runtime.dispose();
});

test("route targets reject arrays/bad revisions and owners recreate runtimes after Strict Mode cleanup", async () => {
  assert.deepEqual(savedMealTarget(id(1).toUpperCase(), "0"), target);
  for (const args of [
    [[], "0"],
    [id(1), ["0"]],
    ["bad", "0"],
    [id(1), "01"],
  ])
    assert.equal(savedMealTarget(...args), null);
  const client = { read: () => Effect.succeed(page()), recipe: () => Effect.succeed(recipe()) };
  for (const owner of [mealLibraryOwner(client), savedMealOwner(client, target)]) {
    const unsubscribe = owner.subscribe(() => {}),
      first = owner.getSnapshot();
    unsubscribe();
    assert.equal(owner.getSnapshot(), null);
    const stop = owner.subscribe(() => {}),
      second = owner.getSnapshot();
    assert.notEqual(first, second);
    await second.load();
    assert.equal(second.getSnapshot().fresh, true);
    await first.load();
    assert.equal(first.getSnapshot().fresh, false);
    stop();
  }
});
