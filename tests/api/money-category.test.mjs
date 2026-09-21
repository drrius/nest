import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readMoneyCategory } from "../../apps/api/src/money/category.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const row = { categoryId: id(100), householdId: id(10), name: "Home", archivedAt: null };
const run = (rows, input = { categoryId: id(100) }) =>
  Effect.runPromise(
    readMoneyCategory(config, caller, input).pipe(
      Effect.provideService(Fetch.Fetch, async () => Response.json(rows)),
    ),
  );
test("expense category adapter rejects foreign/substituted/duplicate fields and distinguishes missing from archived", async () => {
  assert.deepEqual((await run([row])).category, {
    categoryId: id(100),
    name: "Home",
    archived: false,
  });
  assert.equal(
    (await run([{ ...row, archivedAt: "2026-09-21T00:00:00Z" }])).category.archived,
    true,
  );
  assert.equal((await run([])).category, null);
  for (const rows of [
    [{ ...row, householdId: id(20) }],
    [{ ...row, categoryId: id(101) }],
    [row, row],
    [{ ...row, injected: true }],
  ])
    await assert.rejects(run(rows), { code: "unavailable" });
  await assert.rejects(run([row], { categoryId: "bad" }), { code: "invalid_request" });
  await assert.rejects(run([row], { categoryId: id(100), householdId: id(20) }), {
    code: "invalid_request",
  });
});
