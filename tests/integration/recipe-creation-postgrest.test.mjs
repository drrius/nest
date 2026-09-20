import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { recipeCreationFiles, input, id } from "../database/recipe-creation-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const command = () => ({ ...input(), operationId: "ABCDEF00-0000-4000-8000-000000000201" });
async function backend(t, loseResponse = false) {
  const remote = await postgrestFixture(t, [
    ...recipeCreationFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const proxy = loseResponse
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_create_recipe")
    : null;
  const server = nodeServer(
    createHandler({ url: proxy?.url ?? remote.url, publishableKey: "sb_publishable_fixture" }),
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
  const create = (value = command(), bearer = remote.bearer) =>
    fetch(`${url}/v1/meals/recipe/create`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "x-nest-household": id(10),
      },
      body: JSON.stringify(value),
    });
  return { remote, proxy, url, create };
}

test("recipe HTTP recovers committed lost response after partner edits and archive, without duplicate creation", async (t) => {
  const { remote, proxy, create, url } = await backend(t, true);
  assert.equal((await create()).status, 503);
  assert.equal(proxy.dropped(), 1);
  const stored = JSON.parse(
    remote.db.sql("select result from public.nest_recipe_creation_receipts"),
  );
  remote.db.sql(
    `update public.meal_definitions set name='Partner edit',archived_at=now() where id='${stored.definitionId}'`,
  );
  const retry = await create();
  assert.equal(retry.status, 200);
  assert.equal(retry.headers.get("cache-control"), "no-store");
  assert.deepEqual((await retry.json()).receipt, stored);
  assert.equal(stored.revision, "3");
  assert.equal(remote.db.sql("select count(*) from public.nest_recipe_creation_receipts"), "1");
  assert.equal(
    remote.db.sql(`select name from public.meal_definitions where id='${stored.definitionId}'`),
    "Partner edit",
  );
  assert.equal(
    (await create({ ...command(), operationId: id(202) }, remote.partnerBearer)).status,
    409,
  );
  assert.equal((await create(command(), remote.otherBearer)).status, 403);
  assert.equal((await fetch(`${url}/v1/meals/recipe/create`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${url}/v1/meals/recipe/create`)).status, 405);
  assert.equal((await create({ ...command(), actorId: id(2) })).status, 400);
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await create()).status, 403);
});

test("recipe HTTP accepts full ordered drafts above 8 KiB, rejects oversized bodies and stale category references", async (t) => {
  const { remote, create } = await backend(t);
  const originalPlans = remote.db.sql(
    "select jsonb_agg(to_jsonb(p) order by id) from public.meal_plan_entries p",
  );
  const value = command();
  value.recipe.ingredients = Array.from({ length: 200 }, (_, index) => ({
    name: `Ingredient ${index}`,
    quantity: "1/2",
    unit: "cup",
    note: "Keep separate",
    categoryId: null,
  }));
  assert.ok(JSON.stringify(value).length > 8192);
  const response = await create(value);
  assert.equal(response.status, 200);
  const saved = (await response.json()).receipt;
  assert.equal(saved.revision, "201");
  assert.equal(
    remote.db.sql(
      `select count(*) from public.meal_grocery_templates where meal_definition_id='${saved.definitionId}'`,
    ),
    "200",
  );
  const badCategory = { ...command(), operationId: id(204), expectedRevision: "201" };
  badCategory.recipe.ingredients[0].categoryId = id(999);
  assert.equal((await create(badCategory)).status, 409);
  assert.equal(
    (await create({ ...command(), operationId: id(205), padding: "x".repeat(2097152) })).status,
    400,
  );
  assert.equal(remote.db.sql("select count(*) from public.nest_recipe_creation_receipts"), "1");
  assert.equal(
    remote.db.sql("select jsonb_agg(to_jsonb(p) order by id) from public.meal_plan_entries p"),
    originalPlans,
  );
});
