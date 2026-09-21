import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import {
  aiRecipeSelectionFiles,
  input,
  week,
  id,
} from "../database/ai-recipe-selection-fixture.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
const options = (toolCallId) => ({ toolCallId, messages: [] });
async function setup(t) {
  const remote = await postgrestFixture(t, [
    ...aiRecipeSelectionFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const proxy = await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_execute_ai_command");
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Place the saved soup recipe on Monday for dinner",
  };
  const message = {
    id: turn.operationId,
    role: "user",
    parts: [{ type: "text", text: turn.text }],
  };
  remote.db.sql(`set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}';
    select public.nest_begin_ai_turn('${id(10)}','${turn.conversationId}','${turn.operationId}',0,'${JSON.stringify(message)}'::jsonb)`);
  const connect = (lossy = false, bearer = remote.bearer) =>
    householdTools(
      new Request("http://localhost/", { headers: { authorization: `Bearer ${bearer}` } }),
      { url: lossy ? proxy.url : remote.url, publishableKey: "sb_publishable_fixture" },
      { householdId: id(10), turn },
    ).tools;
  return { remote, proxy, turn, connect };
}

test("SDK selection recovers the exact journal result and reads captured ingredients after archive", async (t) => {
  const f = await setup(t),
    tools = f.connect(true),
    value = input();
  const library = await tools.readMealLibrary.execute(
    { afterId: null, expectedRevision: null },
    options("library"),
  );
  assert.equal(library.ok, true);
  const recipe = await tools.readSavedMeal.execute(
    { definitionId: value.definitionId, expectedRevision: library.value.revision },
    options("recipe"),
  );
  assert.equal(recipe.ok, true);
  const plan = await tools.readMealWeek.execute({ weekStart: week }, options("week"));
  assert.equal(plan.value.revision, "0");
  assert.deepEqual(await tools.placeRecipe.execute(value, options("select")), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.proxy.dropped(), 1);
  assert.deepEqual(await tools.placeRecipe.execute(value, options("another-call")), {
    ok: false,
    code: "unavailable",
  });
  const receipt = JSON.parse(
    f.remote.db.sql("select result from public.nest_recipe_selection_receipts"),
  );
  f.remote.db.sql(
    `update public.meal_definitions set name='Later edit',archived_at=now() where id='${id(200)}'; update public.meal_grocery_templates set quantity='99' where id='${id(300)}'`,
  );
  assert.deepEqual(await f.connect(true).placeRecipe.execute(value, options("select")), {
    ok: true,
    value: receipt,
  });
  const target = { weekStart: week, entryId: receipt.entryId, revision: receipt.revision };
  const detail = await f.connect().readPlannedRecipe.execute(target, options("detail"));
  assert.equal(detail.ok, true);
  assert.equal(detail.value.snapshot.recipe.title, recipe.value.recipe.title);
  assert.equal(detail.value.snapshot.recipe.ingredients[0].quantity, "1/2");
  assert.deepEqual(
    await f.connect().readPlannedRecipe.execute({ ...target, revision: "0" }, options("stale")),
    { ok: false, code: "conflict" },
  );
  assert.equal(
    (
      await f
        .connect(false, f.remote.partnerBearer)
        .readPlannedRecipe.execute(target, options("partner"))
    ).ok,
    true,
  );
  assert.deepEqual(
    await f.connect(false, f.remote.partnerBearer).placeRecipe.execute(value, options("select")),
    { ok: false, code: "forbidden" },
  );
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.deepEqual(await f.connect().readPlannedRecipe.execute(target, options("revoked")), {
    ok: false,
    code: "forbidden",
  });
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "1");
});
test("SDK replacement preserves old snapshots and terminal conflicts stop further writes", async (t) => {
  const f = await setup(t),
    tools = f.connect();
  const placed = await tools.placeRecipe.execute(input(), options("place"));
  assert.equal(placed.ok, true);
  const value = input({
    entryId: placed.value.entryId,
    expectedRevision: "1",
    definitionId: id(201),
  });
  const replaced = await tools.replaceWithRecipe.execute(value, options("replace"));
  assert.equal(replaced.ok, true);
  assert.equal(replaced.value.previousEntryId, placed.value.entryId);
  assert.equal(replaced.value.revision, "3");
  const old = await tools.readPlannedRecipe.execute(
    { entryId: placed.value.entryId, weekStart: week, revision: "3" },
    options("old"),
  );
  assert.equal(old.ok, true);
  assert.equal(old.value.entry, null);
  assert.equal(f.remote.db.sql("select count(*) from public.nest_planned_recipe_snapshots"), "2");
  assert.deepEqual(await tools.replaceWithRecipe.execute(value, options("stale")), {
    ok: false,
    code: "conflict",
  });
  assert.deepEqual(
    await tools.placeRecipe.execute(
      input({ date: "2030-01-08", expectedRevision: "3" }),
      options("after-conflict"),
    ),
    { ok: false, code: "unavailable" },
  );
  assert.equal(f.remote.db.sql("select count(*) from public.nest_recipe_selection_receipts"), "2");
});
