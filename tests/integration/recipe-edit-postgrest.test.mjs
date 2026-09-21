import assert from "node:assert/strict";
import { test } from "node:test";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { recipeCreationFiles, id } from "../database/recipe-creation-fixture.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
const command = () => ({
  expectedRevision: "1",
  patch: { title: "Edited soup" },
  ingredients: null,
  definitionId: "ABCDEF00-0000-4000-8000-000000000200",
  operationId: "ABCDEF00-0000-4000-8000-000000000201",
});
async function backend(t, loseResponse = false) {
  const remote = await postgrestFixture(t, [
    ...recipeCreationFiles,
    "supabase/migrations/20260921002813_native_recipe_edit.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  remote.db.sql(
    `insert into public.meal_definitions(id,household_id,name) values('${command().definitionId}','${id(10)}','Soup')`,
  );
  const proxy = loseResponse
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_edit_recipe")
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
  const edit = (value = command(), bearer = remote.bearer) =>
    fetch(`${url}/v1/meals/recipe/edit`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "x-nest-household": id(10),
      },
      body: JSON.stringify(value),
    });
  return { remote, proxy, url, edit };
}

test("edit HTTP recovers original receipt after partner archive without undoing it and rejects revoked recovery", async (t) => {
  const { remote, proxy, edit, url } = await backend(t, true);
  assert.equal((await edit()).status, 503);
  assert.equal(proxy.dropped(), 1);
  const stored = JSON.parse(remote.db.sql("select result from public.nest_recipe_edit_receipts"));
  assert.equal(stored.definitionId, command().definitionId.toLowerCase());
  assert.equal(stored.previousRevision, "1");
  assert.equal(stored.revision, "2");
  remote.db.sql(
    `update public.meal_definitions set archived_at=now(),name='Partner archived' where id='${stored.definitionId}'`,
  );
  const retry = await edit();
  assert.equal(retry.status, 200);
  assert.equal(retry.headers.get("cache-control"), "no-store");
  assert.deepEqual((await retry.json()).receipt, stored);
  assert.equal(
    remote.db.sql(
      `select archived_at is not null from public.meal_definitions where id='${stored.definitionId}'`,
    ),
    "t",
  );
  assert.equal(
    (await edit({ ...command(), operationId: id(900) }, remote.partnerBearer)).status,
    409,
  );
  assert.equal((await edit(command(), remote.otherBearer)).status, 403);
  assert.equal((await fetch(`${url}/v1/meals/recipe/edit`, { method: "POST" })).status, 401);
  assert.equal((await fetch(`${url}/v1/meals/recipe/edit`)).status, 405);
  assert.equal((await edit({ ...command(), actorId: id(2) })).status, 400);
  remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await edit()).status, 403);
});

test("edit HTTP carries a full ingredient selection, canonical replay and bounded bodies", async (t) => {
  const { edit, remote } = await backend(t);
  const ingredients = Array.from({ length: 200 }, (_, n) => ({
    kind: "new",
    name: "Tomato",
    quantity: n % 2 ? "1/2" : "250",
    unit: n % 2 ? "cup" : "g",
    categoryId: null,
    note: "x".repeat(100),
  }));
  const large = { ...command(), ingredients };
  assert.ok(JSON.stringify(large).length > 8192);
  const response = await edit(large);
  assert.equal(response.status, 200);
  const receipt = (await response.json()).receipt;
  assert.equal(receipt.revision, "202");
  const rows = JSON.parse(
    remote.db.sql(
      `select jsonb_agg(to_jsonb(t) order by sort_order) from public.meal_grocery_templates t where meal_definition_id='${receipt.definitionId}'`,
    ),
  );
  assert.equal(rows.length, 200);
  assert.equal(rows[0].quantity, "250");
  assert.equal(rows[0].unit, "g");
  assert.equal(rows[1].quantity, "1/2");
  const value = {
    ...command(),
    operationId: id(950),
    expectedRevision: receipt.revision,
    patch: {},
    ingredients: rows.map((row, n) => ({
      kind: "existing",
      ingredientId: row.id.toUpperCase(),
      patch: n ? {} : { note: null },
    })),
  };
  const patched = await edit(value);
  assert.equal(patched.status, 200);
  const saved = (await patched.json()).receipt;
  assert.equal(saved.revision, "203");
  const replay = await edit({
    ...value,
    ingredients: value.ingredients.map((item) => ({
      ...item,
      ingredientId: item.ingredientId.toLowerCase(),
    })),
  });
  assert.equal(replay.status, 200);
  assert.deepEqual((await replay.json()).receipt, saved);
  assert.equal(
    (
      await edit({
        ...command(),
        operationId: id(951),
        patch: { instructions: "x".repeat(2097153) },
      })
    ).status,
    400,
  );
  assert.equal(remote.db.sql("select count(*) from public.nest_recipe_edit_receipts"), "2");
});
