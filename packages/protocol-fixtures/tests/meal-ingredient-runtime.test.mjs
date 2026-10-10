import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { fixture, run, account } from "./offline-fixture.mjs";
import { IngredientRuntime } from "../src/meals/ingredient-runtime.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const weekStart = "2030-01-07";
const ingredient = (n = 0) => ({
  entryId: id(100),
  ingredientId: id(300 + n),
  quantity: "½",
  unit: "cups",
  name: "Tomatoes",
  mealTitle: "Soup",
  date: weekStart,
  slot: "dinner",
  categoryId: null,
  groceryItemId: null,
});
const page = (rows = [ingredient()]) => ({
  version: 1,
  householdId: account.household,
  weekStart,
  revision: "1",
  ingredients: rows,
  skipped: [],
  nextAfter: null,
});
const receipt = (command) => ({
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  operationId: command.operationId,
  weekStart,
  weekRevision: command.expectedRevision,
  ingredients: command.selected.map(({ entryId, ingredientId }, n) => ({
    entryId,
    ingredientId,
    itemId: id(500 + n),
    outcome: "added",
  })),
});
async function setup(t) {
  const f = await fixture(t),
    calls = [];
  /** @type {Pick<import("../src/meals/client.ts").MealClient, "read" | "ingredients">} */
  const client = {
    read: () =>
      Effect.succeed({
        version: 1,
        householdId: account.household,
        weekStart,
        revision: "1",
        entries: [],
      }),
    ingredients: {
      read: () => Effect.succeed(page()),
      add: (command) => {
        calls.push(command);
        return Effect.succeed(receipt(command));
      },
    },
  };
  const runtime = new IngredientRuntime(
    client,
    { store: f.store, session: f.session },
    weekStart,
    () => id(800),
  );
  t.after(() => runtime.dispose());
  return { ...f, runtime, client, calls };
}
async function select(runtime) {
  await runtime.load();
  const choice = runtime.getSnapshot().attempt.choices[0];
  await runtime.edit({ ...choice, selected: true, quantity: " 1½ " });
}

test("ingredient controller confirms only the captured saved selection and does not resend a success", async (t) => {
  const f = await setup(t);
  await select(f.runtime);
  const sequence = f.runtime.getSnapshot().attempt.sequence;
  await f.runtime.confirm(sequence - 1);
  assert.equal(f.calls.length, 0);
  await f.runtime.confirm(sequence);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].selected[0].quantity, " 1½ ");
  assert.equal(f.runtime.getSnapshot().attempt.pending, null);
  await f.runtime.confirm(sequence);
  await f.runtime.retry();
  assert.equal(f.calls.length, 1);
});
test("an uncertain addition remains frozen through load and uses the original operation on explicit retry", async (t) => {
  const f = await setup(t);
  await select(f.runtime);
  f.client.ingredients.add = (command) => {
    f.calls.push(command);
    return Effect.fail(new PreferenceFailure({ code: "unavailable" }));
  };
  await f.runtime.confirm(f.runtime.getSnapshot().attempt.sequence);
  const pending = f.runtime.getSnapshot().attempt.pending;
  await f.runtime.load();
  await f.runtime.edit({ ...f.runtime.getSnapshot().attempt.choices[0], selected: false });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.runtime.getSnapshot().attempt.pending, pending);
  f.client.ingredients.add = (command) => {
    f.calls.push(command);
    return Effect.succeed(receipt(command));
  };
  await f.runtime.retry();
  assert.deepEqual(f.calls, [pending, pending]);
});
test("incomplete pages never replace durable choices or authorize a partial-list confirmation", async (t) => {
  const f = await setup(t);
  await select(f.runtime);
  const saved = f.runtime.getSnapshot().attempt;
  f.client.ingredients.read = ({ after }) =>
    after
      ? Effect.fail(new PreferenceFailure({ code: "unavailable" }))
      : Effect.succeed({
          ...page(Array.from({ length: 100 }, (_, n) => ingredient(n))),
          nextAfter: { entryId: id(100), ingredientId: id(399) },
        });
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().fresh, false);
  assert.deepEqual(await run(f.store.readIngredientAttempt(f.session, weekStart)), saved);
  await f.runtime.confirm(saved.sequence);
  assert.equal(f.calls.length, 0);
});
test("refresh preserves exclusions and quantity edits while new and already-added sources stay unselected", async (t) => {
  const f = await setup(t);
  await select(f.runtime);
  f.client.ingredients.read = () => Effect.succeed(page([ingredient(), ingredient(1)]));
  await f.runtime.load();
  assert.deepEqual(
    f.runtime.getSnapshot().attempt.choices.map((row) => [row.quantity, row.selected]),
    [
      [" 1½ ", true],
      ["½", false],
    ],
  );
  f.client.ingredients.read = () =>
    Effect.succeed(page([{ ...ingredient(), groceryItemId: id(500) }, ingredient(1)]));
  await f.runtime.load();
  assert.deepEqual(
    f.runtime.getSnapshot().attempt.choices.map((row) => row.selected),
    [false, false],
  );
});
test("storage and changed-account failures prevent confirmation dispatch", async (t) => {
  const f = await setup(t);
  await select(f.runtime);
  f.connection.exec(
    "CREATE TRIGGER no_ingredient_write BEFORE INSERT ON meal_ingredient_attempts BEGIN SELECT RAISE(FAIL,'disk full'); END",
  );
  await f.runtime.confirm(f.runtime.getSnapshot().attempt.sequence);
  assert.equal(f.calls.length, 0);
  f.connection.exec("DROP TRIGGER no_ingredient_write");
  await f.runtime.load();
  await run(f.store.activate({ ...account, actor: id(2) }, id(900)));
  await f.runtime.confirm(f.runtime.getSnapshot().attempt.sequence);
  assert.equal(f.calls.length, 0);
  assert.equal(f.runtime.getSnapshot().access, "verify");
  assert.equal(f.runtime.getSnapshot().attempt, null);
});
test("definite conflicts retain the selection but require a fresh review; revoked access hides it", async (t) => {
  const f = await setup(t);
  await select(f.runtime);
  f.client.ingredients.add = () => Effect.fail(new PreferenceFailure({ code: "conflict" }));
  await f.runtime.confirm(f.runtime.getSnapshot().attempt.sequence);
  assert.equal(f.runtime.getSnapshot().attempt.pending, null);
  assert.equal(f.runtime.getSnapshot().attempt.choices[0].selected, true);
  assert.equal(f.runtime.getSnapshot().fresh, false);
  f.client.read = () => Effect.fail(new PreferenceFailure({ code: "forbidden" }));
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().access, "verify");
  assert.deepEqual(f.runtime.getSnapshot().ingredients, []);
});

test("a quantity editor captured before another selection change cannot overwrite the newer draft", async (t) => {
  const f = await setup(t);
  await select(f.runtime);
  const old = f.runtime.getSnapshot().attempt;
  assert.equal(await f.runtime.edit({ ...old.choices[0], selected: false }, old.sequence), true);
  assert.equal(await f.runtime.edit({ ...old.choices[0], quantity: "9" }, old.sequence), false);
  const saved = await run(f.store.readIngredientAttempt(f.session, weekStart));
  assert.equal(saved.choices[0].selected, false);
  assert.equal(saved.choices[0].quantity, " 1½ ");
});

test("leaving during a dispatched addition retains its exact confirmation and aborts observation", async (t) => {
  const f = await setup(t);
  await select(f.runtime);
  let dispatched;
  const started = new Promise((resolve) => {
    dispatched = resolve;
  });
  f.client.ingredients.add = (command) =>
    Effect.promise(async (signal) => {
      f.calls.push(command);
      dispatched();
      await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      return receipt(command);
    });
  const sending = f.runtime.confirm(f.runtime.getSnapshot().attempt.sequence);
  await started;
  f.runtime.dispose();
  await sending;
  const saved = await run(f.store.readIngredientAttempt(f.session, weekStart));
  assert.deepEqual(saved.pending, f.calls[0]);
  assert.equal(saved.receipt, null);
});
