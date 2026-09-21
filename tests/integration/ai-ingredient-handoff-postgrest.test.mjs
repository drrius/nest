import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, id } from "./meal-ingredient-api-fixture.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
import { actionResult } from "../../apps/mobile/src/assistant/action-result.ts";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
import { IngredientRuntime } from "../../apps/mobile/src/meals/ingredient-runtime.ts";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const options = { toolCallId: "ingredients", messages: [] };
function connect(f, bearer = f.remote.bearer) {
  return householdTools(
    new Request("http://nest.local/", {
      headers: { authorization: `Bearer ${bearer}`, "x-nest-household": id(20) },
    }),
    { url: f.remote.url, publishableKey: "sb_publishable_fixture" },
    {
      householdId: id(10),
      turn: {
        conversationId: id(900),
        operationId: id(901),
        expectedRevision: "0",
        text: "Review this week's ingredients",
      },
    },
  ).tools;
}
test("SDK ingredient handoff opens the exact native week and only explicit native confirmation adds groceries", async (t) => {
  const f = await fixture(t),
    tools = connect(f);
  const read = await tools.readMealIngredients.execute(f.query, options);
  assert.equal(read.ok, true);
  assert.equal(read.value.ingredients.length, 2);
  const result = await tools.openMealIngredientReview.execute(
    { weekStart: f.query.weekStart },
    options,
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.householdId, id(10));
  const card = actionResult({
    type: "tool-openMealIngredientReview",
    state: "output-available",
    output: result,
  });
  assert.equal(card.href.pathname, "/meal-ingredients");
  assert.equal(card.href.params.weekStart, f.query.weekStart);
  assert.match(card.label, /nothing added/);
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "0");
  const local = await sqlite(t),
    account = { actor: id(1), household: id(10) };
  const session = await run(local.store.activate(account, id(902)));
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
    card.href.params.weekStart,
    () => id(903),
  );
  t.after(() => runtime.dispose());
  await runtime.load();
  assert.equal(runtime.getSnapshot().fresh, true);
  assert.equal(
    runtime.getSnapshot().attempt.choices.some((row) => row.selected),
    false,
  );
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "0");
  await runtime.edit({ ...runtime.getSnapshot().attempt.choices[0], selected: true });
  await runtime.confirm(runtime.getSnapshot().attempt.sequence);
  assert.equal(runtime.getSnapshot().receipt.ingredients.length, 1);
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "1");
  assert.equal(Object.hasOwn(tools, "addMealIngredients"), false);
});
test("ingredient SDK reads and handoffs reject foreign/revoked scope, stale revisions and authority injection", async (t) => {
  const f = await fixture(t),
    tools = connect(f);
  const query = { weekStart: f.query.weekStart };
  for (const input of [
    { ...query, householdId: id(20) },
    { ...query, approved: true },
    { weekStart: "bad" },
  ])
    assert.equal((await tools.openMealIngredientReview.execute(input, options)).ok, false);
  assert.deepEqual(
    await tools.readMealIngredients.execute({ ...f.query, expectedRevision: "0" }, options),
    { ok: false, code: "conflict" },
  );
  const foreign = connect(f, f.remote.otherBearer);
  assert.deepEqual(await foreign.openMealIngredientReview.execute(query, options), {
    ok: false,
    code: "forbidden",
  });
  assert.deepEqual(await foreign.readMealIngredients.execute(f.query, options), {
    ok: false,
    code: "forbidden",
  });
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.deepEqual(await tools.openMealIngredientReview.execute(query, options), {
    ok: false,
    code: "forbidden",
  });
  assert.deepEqual(await tools.readMealIngredients.execute(f.query, options), {
    ok: false,
    code: "forbidden",
  });
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "0");
});
