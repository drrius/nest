import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { recipeSelectionFiles, id, input, week } from "../database/recipe-selection-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
async function backend(t, rpc) {
  const remote = await postgrestFixture(t, [
    ...recipeSelectionFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  remote.db.sql(
    `insert into public.grocery_items(id,household_id,name) values('${id(500)}','${id(10)}','Existing groceries')`,
  );
  const proxy = await lostResponseProxy(t, remote.url, `/rest/v1/rpc/${rpc}`);
  const server = nodeServer(
    createHandler({ url: proxy.url, publishableKey: "sb_publishable_fixture" }),
  );
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
    "content-type": "application/json",
  });
  const write = (path, value, bearer) =>
    fetch(url + path, { method: "POST", headers: headers(bearer), body: JSON.stringify(value) });
  const read = (entryId, revision, bearer) =>
    fetch(
      url +
        "/v1/meals/planned-recipe?" +
        new URLSearchParams({ entryId, weekStart: week, revision }),
      { headers: headers(bearer) },
    );
  return { remote, proxy, url, headers, write, read };
}
test("HTTP selected recipe survives lost response and library archive; unauthorized recovery is denied", async (t) => {
  const f = await backend(t, "nest_place_recipe"),
    value = { ...input(), operationId: "ABCDEF00-0000-4000-8000-000000000800" };
  assert.equal((await f.write("/v1/meals/recipe/place", value)).status, 503);
  assert.equal(f.proxy.dropped(), 1);
  const saved = JSON.parse(
    f.remote.db.sql("select result from public.nest_recipe_selection_receipts"),
  );
  f.remote.db.sql(
    `update public.meal_definitions set name='Later library edit',archived_at=now() where id='${id(200)}'; update public.meal_grocery_templates set quantity='99' where id='${id(300)}'`,
  );
  const retry = await f.write("/v1/meals/recipe/place", value);
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json()).receipt, saved);
  const response = await f.read(saved.entryId, saved.revision);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const detail = await response.json();
  assert.equal(detail.snapshot.recipe.title, "Legacy soup");
  assert.equal(detail.snapshot.recipe.instructions, null);
  assert.equal(detail.snapshot.recipe.ingredients[0].quantity, "1/2");
  assert.equal((await f.read(saved.entryId, "0")).status, 409);
  assert.equal((await f.read(saved.entryId, "1", f.remote.partnerBearer)).status, 200);
  assert.equal((await f.read(saved.entryId, "1", f.remote.otherBearer)).status, 403);
  assert.equal(
    (
      await f.write(
        "/v1/meals/recipe/place",
        { ...value, operationId: id(801) },
        f.remote.partnerBearer,
      )
    ).status,
    409,
  );
  assert.equal(
    (await f.write("/v1/meals/recipe/place", { ...value, title: "Injected" })).status,
    400,
  );
  assert.equal((await fetch(f.url + "/v1/meals/recipe/place")).status, 405);
  assert.equal((await fetch(f.url + "/v1/meals/planned-recipe")).status, 401);
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await f.write("/v1/meals/recipe/place", value)).status, 403);
  assert.equal((await f.read(saved.entryId, "1")).status, 403);
});
test("HTTP replacement recovers its original receipt, keeps old history and never adds groceries", async (t) => {
  const f = await backend(t, "nest_replace_with_recipe");
  const placed = await f.write("/v1/meals/recipe/place", { ...input(), operationId: id(800) });
  assert.equal(placed.status, 200);
  const first = (await placed.json()).receipt,
    value = {
      ...input({ expectedRevision: first.revision, definitionId: id(201) }),
      entryId: first.entryId,
      operationId: id(801),
    };
  assert.equal((await f.write("/v1/meals/recipe/replace", value)).status, 503);
  const retry = await f.write("/v1/meals/recipe/replace", value);
  assert.equal(retry.status, 200);
  const saved = (await retry.json()).receipt;
  assert.equal(saved.previousEntryId, first.entryId);
  assert.equal(saved.revision, "3");
  assert.notEqual(saved.entryId, first.entryId);
  assert.equal((await (await f.read(first.entryId, "3")).json()).entry, null);
  assert.equal(
    (await (await f.read(saved.entryId, "3")).json()).snapshot.recipe.title,
    "Second recipe",
  );
  assert.equal(f.remote.db.sql("select count(*) from public.nest_planned_recipe_snapshots"), "2");
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "1");
  assert.equal(
    (await f.write("/v1/meals/recipe/replace", { ...value, operationId: id(802) })).status,
    409,
  );
});
