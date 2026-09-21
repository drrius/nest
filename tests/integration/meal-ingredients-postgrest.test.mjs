import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id } from "./meal-ingredient-api-fixture.mjs";
import { json } from "../database/recipe-selection-fixture.mjs";

test("HTTP review paginates 200 retained ingredients and accepts a selected batch above the ordinary body limit", async (t) => {
  const f = await fixture(t);
  const ingredients = Array.from({ length: 200 }, (_, n) => ({
    ingredientId: id(1000 + n),
    order: n,
    name: "Tomatoes",
    quantity: "½",
    unit: null,
    categoryId: null,
    note: null,
  }));
  f.remote.db.sql(
    `update public.nest_planned_recipe_snapshots set recipe=jsonb_set(recipe,'{ingredients}',${json(ingredients)}) where entry_id='${f.placed.entryId}'`,
  );
  const first = await (await f.post("read", f.query)).json();
  assert.equal(first.ingredients.length, 100);
  assert.ok(first.nextAfter);
  const next = await f.post("read", { ...f.query, after: first.nextAfter });
  assert.equal(next.status, 200);
  const second = await next.json();
  assert.equal(second.ingredients.length, 100);
  assert.equal(second.nextAfter, null);
  const selected = [...first.ingredients, ...second.ingredients].map(
    ({ entryId, ingredientId }) => ({
      entryId,
      ingredientId,
      quantity: "🍅".repeat(80),
      unit: null,
    }),
  );
  const value = {
    operationId: id(830),
    weekStart: f.query.weekStart,
    expectedRevision: f.query.expectedRevision,
    selected,
  };
  assert.ok(Buffer.byteLength(JSON.stringify(value)) > 8192);
  const added = await f.post("add", value);
  assert.equal(added.status, 200);
  assert.equal((await added.json()).receipt.ingredients.length, 200);
  assert.equal(
    f.remote.db.sql("select count(*) from public.grocery_items where length(quantity)=80"),
    "200",
  );
});

test("HTTP ingredient review adds only selected sources and recovers lost committed acknowledgment", async (t) => {
  const f = await fixture(t, true);
  const response = await f.post("read", f.query);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const page = await response.json();
  assert.equal(page.ingredients.length, 2);
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "0");
  const source = page.ingredients[0];
  const value = {
    operationId: id(810),
    weekStart: page.weekStart,
    expectedRevision: page.revision,
    selected: [
      { entryId: source.entryId, ingredientId: source.ingredientId, quantity: "1½", unit: null },
    ],
  };
  assert.equal((await f.post("add", value)).status, 503);
  assert.equal(f.upstream.dropped(), 1);
  const saved = JSON.parse(
    f.remote.db.sql("select result from private.nest_meal_ingredient_receipts"),
  );
  const item = saved.ingredients[0].itemId;
  f.remote.db.sql(
    `update public.grocery_items set name='Partner correction',quantity='4' where id='${item}'`,
  );
  const retried = await f.post("add", value);
  assert.equal(retried.status, 200);
  assert.deepEqual((await retried.json()).receipt, saved);
  const partner = await f.post("add", { ...value, operationId: id(811) }, f.remote.partnerBearer);
  assert.equal(partner.status, 200);
  assert.deepEqual((await partner.json()).receipt.ingredients, [
    { ...saved.ingredients[0], outcome: "already_added" },
  ]);
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "1");
  assert.equal(
    f.remote.db.sql("select name || ':' || quantity from public.grocery_items"),
    "Partner correction:4",
  );
  const reread = await (await f.post("read", f.query)).json();
  assert.equal(reread.ingredients[0].groceryItemId, item);
  assert.equal(reread.ingredients[1].groceryItemId, null);
  f.remote.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.equal((await f.post("add", value)).status, 403);
  assert.equal((await f.post("read", f.query)).status, 403);
});

test("HTTP review rejects stale weeks, foreign callers, injected fields and oversized bodies without writes", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post("read", { ...f.query, expectedRevision: "0" })).status, 409);
  assert.equal((await f.post("read", f.query, f.remote.otherBearer)).status, 403);
  assert.equal((await f.post("read?householdId=" + id(20), f.query)).status, 400);
  assert.equal((await f.post("read", { ...f.query, after: { entryId: id(1) } })).status, 400);
  const source = (await (await f.post("read", f.query)).json()).ingredients[0];
  const value = {
    operationId: id(820),
    weekStart: f.query.weekStart,
    expectedRevision: f.query.expectedRevision,
    selected: [
      { entryId: source.entryId, ingredientId: source.ingredientId, quantity: null, unit: null },
    ],
  };
  assert.equal((await f.post("add", value, f.remote.otherBearer)).status, 403);
  assert.equal(
    (await f.post("add", { ...value, selected: [{ ...value.selected[0], name: "Injected" }] }))
      .status,
    400,
  );
  assert.equal((await f.post("add", { ...value, expectedRevision: "0" })).status, 409);
  assert.equal((await fetch(f.url + "read", { headers: f.headers() })).status, 405);
  assert.equal((await fetch(f.url + "read", { method: "POST", body: "{}" })).status, 401);
  assert.equal(
    (
      await fetch(f.url + "add", {
        method: "POST",
        headers: f.headers(),
        body: " ".repeat(8388609),
      })
    ).status,
    400,
  );
  assert.equal(f.remote.db.sql("select count(*) from public.grocery_items"), "0");
});
