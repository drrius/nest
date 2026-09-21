import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readMoneyCategories } from "../../apps/api/src/money/categories.ts";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const caller = {
    token: "fixture",
    member: { userId: id(1), householdId: id(10), displayName: "A" },
  },
  config = { url: "http://localhost/", publishableKey: "fixture" };
const row = (n) => ({
  categoryId: id(n),
  householdId: id(10),
  name: `Category ${n}`,
  archivedAt: null,
});
const run = (rows, input = { after: null }) =>
  Effect.runPromise(
    readMoneyCategories(config, caller, input).pipe(
      Effect.provideService(Fetch.Fetch, async () => Response.json(rows)),
    ),
  );
test("category pages reject foreign, archived, unordered, duplicate, unbounded and injected responses", async () => {
  const rows = Array.from({ length: 51 }, (_, index) => row(index + 100));
  const page = await run(rows);
  assert.equal(page.categories.length, 50);
  assert.equal(page.next, id(149));
  assert.equal((await run(rows.slice(0, 50))).next, null);
  assert.deepEqual((await run([])).categories, []);
  for (const value of [
    [row(101), row(100)],
    [row(100), row(100)],
    [{ ...row(100), householdId: id(20) }],
    [{ ...row(100), archivedAt: "2026-09-21" }],
    [{ ...row(100), extra: true }],
    [...rows, row(151)],
  ])
    await assert.rejects(run(value), { code: "unavailable" });
  await assert.rejects(run([row(100)], { after: id(100) }), { code: "unavailable" });
  await assert.rejects(run([], { after: null, actorId: id(2) }), { code: "invalid_request" });
});
