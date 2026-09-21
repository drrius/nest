import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, id } from "./meal-ingredient-api-fixture.mjs";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { IngredientRuntime } from "../../apps/mobile/src/meals/ingredient-runtime.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
test("ingredient controller restores a lost-confirmation request after restart and reconciles partner edits", async (t) => {
  const f = await fixture(t, true),
    local = await sqlite(t);
  const account = { actor: id(1), household: id(10) };
  const session = await run(local.store.activate(account, id(900)));
  const client = mealClient(
    new URL("/", f.url).href,
    account,
    Effect.succeed({
      access_token: f.remote.bearer,
      refresh_token: "fixture",
      user: { id: id(1) },
    }),
  );
  const runtime = new IngredientRuntime(
    client,
    { store: local.store, session },
    f.query.weekStart,
    () => id(850),
  );
  t.after(() => runtime.dispose());
  await runtime.load();
  assert.equal(runtime.getSnapshot().fresh, true);
  await runtime.edit({
    ...runtime.getSnapshot().attempt.choices[0],
    selected: true,
    quantity: " 1½ ",
  });
  await runtime.confirm(runtime.getSnapshot().attempt.sequence);
  assert.equal(runtime.getSnapshot().receipt, null);
  const original = runtime.getSnapshot().attempt.pending;
  assert.equal(original.operationId, id(850));
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "1");
  runtime.dispose();
  const reopened = local.reopen();
  const resumedSession = await run(reopened.store.activate(account, id(901)));
  const resumed = new IngredientRuntime(
    client,
    { store: reopened.store, session: resumedSession },
    f.query.weekStart,
    () => {
      throw new Error("Recovery must not create a new operation");
    },
  );
  t.after(() => resumed.dispose());
  await resumed.load();
  assert.deepEqual(resumed.getSnapshot().attempt.pending, original);
  assert.equal(f.remote.db.sql("select count(*) from private.nest_meal_ingredient_receipts"), "1");
  f.remote.db.sql("update public.grocery_items set quantity='Partner correction'");
  await resumed.retry();
  assert.equal(resumed.getSnapshot().receipt.operationId, id(850));
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "1");
  assert.equal(f.remote.db.sql("select quantity from public.grocery_items"), "Partner correction");
  await resumed.load();
  assert.equal(resumed.getSnapshot().fresh, true);
  assert.ok(resumed.getSnapshot().ingredients[0].groceryItemId);
  assert.deepEqual(
    resumed.getSnapshot().attempt.choices.map((row) => row.selected),
    [false, false],
  );
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await resumed.load();
  assert.equal(resumed.getSnapshot().access, "verify");
  assert.equal(resumed.getSnapshot().attempt, null);
  assert.deepEqual(resumed.getSnapshot().ingredients, []);
});
