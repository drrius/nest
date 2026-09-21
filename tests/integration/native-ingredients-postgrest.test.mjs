import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id } from "./meal-ingredient-api-fixture.mjs";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { createRequire } from "node:module";
import { mealClient } from "../../apps/mobile/src/meals/client.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));

test("native ingredient client and SQLite retry the original confirmation after lost HTTP acknowledgment and restart", async (t) => {
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
  const page = await run(client.ingredients.read(f.query));
  const choices = page.ingredients.map(({ entryId, ingredientId, quantity, unit }, index) => ({
    entryId,
    ingredientId,
    quantity,
    unit,
    selected: index === 0,
  }));
  const draft = await run(
    local.store.saveIngredientDraft(session, {
      draft: { weekStart: page.weekStart, weekRevision: page.revision, choices },
      expectedSequence: null,
    }),
  );
  const command = {
    operationId: id(850),
    weekStart: page.weekStart,
    expectedRevision: page.revision,
    selected: choices
      .filter((row) => row.selected)
      .map(({ entryId, ingredientId, quantity, unit }) => ({
        entryId,
        ingredientId,
        quantity,
        unit,
      })),
  };
  await run(
    local.store.stageIngredientAddition(session, { command, expectedSequence: draft.sequence }),
  );
  await assert.rejects(run(client.ingredients.add(command)), (e) => e.code === "unavailable");
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "1");
  const reopened = local.reopen();
  const resumedSession = await run(reopened.store.activate(account, id(901)));
  const resumed = await run(reopened.store.readIngredientAttempt(resumedSession, page.weekStart));
  assert.deepEqual(resumed.pending, command);
  f.remote.db.sql("update public.grocery_items set quantity='Partner correction'");
  const receipt = await run(client.ingredients.add(resumed.pending));
  await run(reopened.store.recordIngredientAddition(resumedSession, receipt));
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "1");
  assert.equal(f.remote.db.sql("select quantity from public.grocery_items"), "Partner correction");
  assert.equal(
    (await run(reopened.store.readIngredientAttempt(resumedSession, page.weekStart))).pending,
    null,
  );
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await assert.rejects(run(client.ingredients.read(f.query)), (e) => e.code === "forbidden");
  await assert.rejects(run(client.ingredients.add(command)), (e) => e.code === "forbidden");
});
