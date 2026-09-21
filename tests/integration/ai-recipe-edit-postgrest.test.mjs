import { boundedEditInput } from "../database/ai-recipe-edit-fixture.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { aiRecipeCreationFiles } from "../database/ai-recipe-creation-files.mjs";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
import { input } from "../database/recipe-edit-fixture.mjs";
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
    text: "Rename the saved soup recipe",
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

test("SDK edit recovers a lost journal response without undoing a later partner edit", async (t) => {
  const f = await setup(t),
    tools = f.connect(true);
  const read = await tools.readMealLibrary.execute(
    { afterId: null, expectedRevision: null },
    options("read"),
  );
  assert.equal(read.ok, true);
  assert.equal(read.value.revision, "0");
  assert.deepEqual(await tools.editRecipe.execute(value, options("edit")), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.proxy.dropped(), 1);
  assert.deepEqual(await tools.editRecipe.execute(value, options("new-call")), {
    ok: false,
    code: "unavailable",
  });
  const receipt = JSON.parse(
    f.remote.db.sql("select result from public.nest_recipe_edit_receipts"),
  );
  f.remote.db.sql(
    `update public.meal_definitions set name='Restored soup',archived_at=null where id='${receipt.definitionId}'`,
  );
  assert.deepEqual(await f.connect(true).editRecipe.execute(value, options("edit")), {
    ok: true,
    value: receipt,
  });
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "1");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_recipe_edit_receipts"), "1");
  const current = await f
    .connect()
    .readMealLibrary.execute({ afterId: null, expectedRevision: null }, options("current"));
  assert.equal(current.value.revision, "2");
  assert.equal(
    current.value.meals.some((recipe) => recipe.definitionId === receipt.definitionId),
    true,
  );
  assert.deepEqual(
    await f.connect(false, f.remote.partnerBearer).editRecipe.execute(value, options("edit")),
    { ok: false, code: "forbidden" },
  );
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.deepEqual(await f.connect().editRecipe.execute(value, options("edit")), {
    ok: false,
    code: "forbidden",
  });
});
test("SDK stale edit records a conflict and blocks further writes in the turn", async (t) => {
  const f = await setup(t),
    tools = f.connect();
  f.remote.db.sql(
    `update public.meal_definitions set name='Partner edit' where id='${value.definitionId}'`,
  );
  assert.deepEqual(await tools.editRecipe.execute(value, options("stale")), {
    ok: false,
    code: "conflict",
  });
  assert.deepEqual(
    await tools.editRecipe.execute({ ...value, expectedRevision: "1" }, options("new-call")),
    { ok: false, code: "unavailable" },
  );
  assert.deepEqual(await f.connect().editRecipe.execute(value, options("stale")), {
    ok: false,
    code: "conflict",
  });
  assert.equal(f.remote.db.sql("select count(*) from public.nest_recipe_edit_receipts"), "0");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "1");
});

test("oversize SDK edit hands off before writes and stops later actions", async (t) => {
  const f = await setup(t),
    tools = f.connect();
  assert.deepEqual(await tools.editRecipe.execute(boundedEditInput(49153), options("large")), {
    ok: false,
    code: "native_required",
  });
  assert.deepEqual(await tools.editRecipe.execute(value, options("later")), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(f.remote.db.sql("select count(*) from public.nest_recipe_edit_receipts"), "0");
  assert.equal(f.remote.db.sql("select count(*) from public.nest_ai_commands"), "0");
});
