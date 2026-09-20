import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { aiRecipeCreationFiles } from "../database/ai-recipe-creation-files.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
import { input } from "../database/recipe-creation-fixture.mjs";
const value = input();
const options = (toolCallId) => ({ toolCallId, messages: [] });
async function setup(t) {
  const remote = await postgrestFixture(t, [
    ...aiRecipeCreationFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const proxy = await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_execute_ai_command");
  const turn = {
    conversationId: id(900),
    operationId: id(901),
    expectedRevision: "0",
    text: "Save this soup recipe",
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

test("SDK recipe creation recovers committed lost response after partner archive without duplication", async (t) => {
  const f = await setup(t),
    tools = f.connect(true);
  const read = await tools.readMealLibrary.execute(
    { afterId: null, expectedRevision: null },
    options("read"),
  );
  assert.equal(read.ok, true);
  assert.equal(read.value.revision, "0");
  assert.deepEqual(await tools.createRecipe.execute(value, options("save")), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.proxy.dropped(), 1);
  assert.deepEqual(await tools.createRecipe.execute(value, options("duplicate")), {
    ok: false,
    code: "unavailable",
  });
  const receipt = JSON.parse(
    f.remote.db.sql("select result from public.nest_recipe_creation_receipts"),
  );
  f.remote.db.sql(
    `update public.meal_definitions set name='Partner edit',archived_at=now() where id='${receipt.definitionId}'`,
  );
  assert.deepEqual(await f.connect(true).createRecipe.execute(value, options("save")), {
    ok: true,
    value: receipt,
  });
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_recipe_creation_receipts"), "1");
  assert.deepEqual(
    await f.connect(false, f.remote.partnerBearer).createRecipe.execute(value, options("save")),
    { ok: false, code: "forbidden" },
  );
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.deepEqual(await f.connect().createRecipe.execute(value, options("save")), {
    ok: false,
    code: "forbidden",
  });
});
test("SDK large recipes hand off without writing or allowing later mutating tools in the turn", async (t) => {
  const f = await setup(t),
    tools = f.connect();
  const large = input();
  large.recipe.ingredients = Array.from({ length: 100 }, () => ({
    ...large.recipe.ingredients[0],
    note: "x".repeat(1000),
  }));
  assert.deepEqual(await tools.createRecipe.execute(large, options("large")), {
    ok: false,
    code: "native_required",
  });
  assert.deepEqual(await tools.createRecipe.execute(value, options("smaller")), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "0");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_recipe_creation_receipts"), "0");
});
