import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mealClient } from "../src/meals/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const credentials = { access_token: "fixture", refresh_token: "fixture", user: { id: id(1) } };
const client = mealClient("http://localhost/", account, Effect.succeed(credentials));
const query = { weekStart: "2030-01-07", expectedRevision: "1", after: null };
const selected = [{ entryId: id(100), ingredientId: id(300), quantity: "½", unit: null }];
const command = {
  operationId: id(800),
  weekStart: query.weekStart,
  expectedRevision: "1",
  selected,
};
const page = {
  version: 1,
  householdId: id(10),
  weekStart: query.weekStart,
  revision: "1",
  nextAfter: null,
  skipped: [],
  ingredients: [
    {
      ...selected[0],
      mealTitle: "Soup",
      date: query.weekStart,
      slot: "dinner",
      name: "Tomatoes",
      categoryId: null,
      groceryItemId: null,
    },
  ],
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(800),
  weekStart: query.weekStart,
  weekRevision: "1",
  ingredients: [{ entryId: id(100), ingredientId: id(300), itemId: id(500), outcome: "added" }],
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));

test("native ingredient requests send account identity and reject stale or regressing pages", async () => {
  assert.deepEqual(
    await run(client.ingredients.read(query), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/ingredients/read");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      assert.equal(new Headers(init.headers).get("x-nest-household"), account.household);
      assert.deepEqual(JSON.parse(init.body), query);
      return Response.json(page);
    }),
    page,
  );
  for (const patch of [{ householdId: id(20) }, { revision: "2" }, { weekStart: "2030-01-14" }])
    await assert.rejects(
      run(client.ingredients.read(query), async () => Response.json({ ...page, ...patch })),
    );
  await assert.rejects(
    run(
      client.ingredients.read({ ...query, after: { entryId: id(100), ingredientId: id(300) } }),
      async () => Response.json(page),
    ),
    (e) => e.code === "unavailable",
  );
});
test("native ingredient success requires the exact confirmed operation, owner, baseline and sources", async () => {
  assert.deepEqual(
    await run(client.ingredients.add(command), async () => Response.json({ version: 1, receipt })),
    receipt,
  );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(801) },
    { weekRevision: "2" },
    { ingredients: [{ ...receipt.ingredients[0], ingredientId: id(301) }] },
  ])
    await assert.rejects(
      run(client.ingredients.add(command), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      (e) => e.code === "unavailable",
    );
});
test("native ingredient account changes and invalid commands never dispatch", async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return Response.json(page);
  };
  const other = mealClient(
    "http://localhost/",
    account,
    Effect.succeed({ ...credentials, user: { id: id(2) } }),
  );
  await assert.rejects(run(other.ingredients.read(query), fetch), (e) => e.code === "session");
  await assert.rejects(
    run(
      client.ingredients.add({ ...command, selected: [{ ...selected[0], name: "Injected" }] }),
      fetch,
    ),
    (e) => e.code === "invalid",
  );
  assert.equal(calls, 0);
});
