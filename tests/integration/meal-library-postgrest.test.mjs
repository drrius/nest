import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { householdTools } from "../../apps/api/src/assistant/tools.ts";
import { mealLibraryFiles, id } from "../database/meal-library-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
async function backend(t) {
  const remote = await postgrestFixture(t, [
    ...mealLibraryFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const config = { url: remote.url, publishableKey: "sb_publishable_fixture" };
  const server = nodeServer(createHandler(config));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  const headers = (bearer = remote.bearer) => ({
    authorization: `Bearer ${bearer}`,
    "x-nest-household": id(10),
  });
  const read = (path = "library", bearer = remote.bearer) =>
    fetch(`${url}/v1/meals/${path}`, { headers: headers(bearer) });
  const tools = (bearer = remote.bearer) =>
    householdTools(new Request(`${url}/v1/assistant/turn`, { headers: headers(bearer) }), config, {
      householdId: id(10),
      turn: {
        conversationId: id(900),
        operationId: id(901),
        expectedRevision: "0",
        text: "Read saved recipes",
      },
    }).tools;
  return { remote, url, read, tools };
}
const options = { toolCallId: "read-library", messages: [] };

test("real HTTP and registered private SDK tools read the same recipes and expose stale revisions as conflicts", async (t) => {
  const { remote, read, tools } = await backend(t);
  const response = await read();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const page = await response.json();
  assert.equal(page.revision, "0");
  assert.deepEqual(
    await tools().readMealLibrary.execute({ afterId: null, expectedRevision: null }, options),
    { ok: true, value: page },
  );
  assert.deepEqual(await (await read("library", remote.partnerBearer)).json(), page);
  const input = { definitionId: id(200).toUpperCase(), expectedRevision: "0" };
  const detailResponse = await read(`recipe?definitionId=${input.definitionId}&expectedRevision=0`);
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.equal(detail.recipe.ingredients.length, 2);
  assert.equal(detail.recipe.servings, null);
  assert.equal(detail.recipe.instructions, null);
  assert.deepEqual(await tools().readSavedMeal.execute(input, options), {
    ok: true,
    value: detail,
  });
  remote.db.sql(`update public.meal_grocery_templates set quantity='3' where id='${id(300)}'`);
  assert.equal((await read(`recipe?definitionId=${id(200)}&expectedRevision=0`)).status, 409);
  assert.equal((await read(`library?afterId=${id(200)}&expectedRevision=0`)).status, 409);
  assert.deepEqual(await tools().readSavedMeal.execute(input, options), {
    ok: false,
    code: "conflict",
  });
  assert.deepEqual(
    await tools().readMealLibrary.execute({ afterId: id(200), expectedRevision: "0" }, options),
    { ok: false, code: "conflict" },
  );
  const fresh = await (await read()).json();
  const updated = await tools(remote.partnerBearer).readSavedMeal.execute(
    { ...input, expectedRevision: fresh.revision },
    options,
  );
  assert.equal(updated.value.recipe.ingredients[0].quantity, "3");
  assert.equal(updated.value.recipe.ingredients[0].unit, "cup");
  assert.equal(updated.value.recipe.ingredients[1].quantity, "250");
  remote.db.sql(`update public.meal_definitions set archived_at=now() where id='${id(200)}'`);
  const archived = await tools().readSavedMeal.execute(
    { ...input, expectedRevision: "2" },
    options,
  );
  assert.deepEqual(archived, { ok: true, value: { ...detail, revision: "2", recipe: null } });
  assert.equal(remote.db.sql("select count(*) from public.meal_plan_entries"), "3");
});

test("HTTP and SDK reads enforce current tenant membership and reject hidden or malformed input", async (t) => {
  const { remote, url, read, tools } = await backend(t);
  const input = { definitionId: id(200), expectedRevision: "0" };
  const library = { afterId: null, expectedRevision: null };
  assert.equal((await read("library", remote.otherBearer)).status, 403);
  assert.equal((await fetch(`${url}/v1/meals/library`)).status, 401);
  assert.equal((await fetch(`${url}/v1/meals/recipe`, { method: "POST" })).status, 405);
  for (const path of [
    "library?householdId=foreign",
    `library?afterId=${id(200)}`,
    "library?expectedRevision=0&expectedRevision=0",
    `recipe?definitionId=${id(200)}`,
    `recipe?definitionId=${id(200)}&expectedRevision=0&actorId=${id(1)}`,
  ]) {
    assert.equal((await read(path)).status, 400);
  }
  assert.deepEqual(await tools(remote.otherBearer).readMealLibrary.execute(library, options), {
    ok: false,
    code: "forbidden",
  });
  assert.deepEqual(await tools(remote.otherBearer).readSavedMeal.execute(input, options), {
    ok: false,
    code: "forbidden",
  });
  assert.deepEqual(
    await tools().readMealLibrary.execute({ ...library, householdId: id(20) }, options),
    { ok: false, code: "unavailable" },
  );
  const foreign = await tools().readSavedMeal.execute({ ...input, definitionId: id(202) }, options);
  assert.equal(foreign.value.recipe, null);
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await read()).status, 403);
  assert.equal((await read(`recipe?definitionId=${id(200)}&expectedRevision=0`)).status, 403);
  assert.deepEqual(await tools().readMealLibrary.execute(library, options), {
    ok: false,
    code: "forbidden",
  });
  assert.deepEqual(await tools().readSavedMeal.execute(input, options), {
    ok: false,
    code: "forbidden",
  });
});
