import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as Fetch from "effect/unstable/http/FetchHttpClient";
import { expenseCategoryClient } from "../src/money/category-client.ts";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
const client = expenseCategoryClient(
  "http://localhost/",
  { actor: id(1), household: id(10) },
  Effect.succeed({ user: { id: id(1) }, access_token: "fixture" }),
);
const category = (n) => ({ categoryId: id(n), name: `Category ${n}`, archived: false });
const page = {
  version: 1,
  householdId: id(10),
  after: null,
  categories: [category(100)],
  next: null,
};
const run = (value, cursor = null) =>
  Effect.runPromise(
    client
      .categories(cursor)
      .pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value))),
  );
test("native category selection rejects foreign pages, wrong cursors and misleading pagination", async () => {
  assert.deepEqual(await run(page), page);
  await assert.rejects(run({ ...page, householdId: id(20) }), { code: "forbidden" });
  for (const patch of [
    { after: id(99) },
    { next: id(100) },
    { categories: [category(100), category(100)] },
    { categories: [category(101), category(100)] },
    { categories: [{ ...category(100), archived: true }] },
  ])
    await assert.rejects(run({ ...page, ...patch }), { code: "unavailable" });
  await assert.rejects(run({ ...page, after: id(100) }, id(100)), { code: "unavailable" });
});
