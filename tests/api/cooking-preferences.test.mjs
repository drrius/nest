import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { cookingPreferences } from "../../apps/api/src/cooking/service.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const service = cookingPreferences(
  { url: "http://localhost/", publishableKey: "sb_publishable_fixture" },
  { member: { userId: id(1), householdId: id(10), displayName: "Fixture" }, token: "fixture" },
);
const preferences = { cookingNotes: "Quick meals", mealSlots: ["dinner"] };
const command = { operationId: id(100), expectedRevision: "0", preferences };
const row = { ...preferences, householdId: id(10), revision: "1" };
const response = (value, range = "0-0/1") =>
  Response.json(value, { headers: { "content-range": range } });
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("cooking reads fail closed on wrong household, numeric revision, partial ranges and private fields", async () => {
  for (const [rows, range] of [
    [[row], "0-0/2"],
    [[], "*/1"],
    [[{ ...row, householdId: id(20) }], "0-0/1"],
    [[{ ...row, revision: 1 }], "0-0/1"],
    [[{ ...row, calorieGoal: 2000 }], "0-0/1"],
  ])
    await assert.rejects(
      run(service.read(), async () => response(rows, range)),
      { code: "unavailable" },
    );
  assert.equal(await run(service.read(), async () => response([], "*/0")), null);
  assert.deepEqual(
    await run(service.read(), async (url) => {
      assert.equal(new URL(url).searchParams.get("household_id"), `eq.${id(10)}`);
      return response([row]);
    }),
    { revision: "1", preferences },
  );
});
test("cooking mutation validates actor-bound acknowledgment and rejects invalid choices before dispatch", async () => {
  const receipt = { actorId: id(1), householdId: id(10), operationId: id(100), revision: "1" };
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(101) },
    { revision: "2" },
  ])
    await assert.rejects(
      run(service.save(command), async () => response({ ...receipt, ...patch })),
      { code: "unavailable" },
    );
  assert.deepEqual(
    await run(service.save(command), async (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_operation: id(100),
        p_expected: "0",
        p_notes: preferences.cookingNotes,
        p_slots: preferences.mealSlots,
      });
      return response(receipt);
    }),
    receipt,
  );
  await assert.rejects(
    run(service.save({ ...command, preferences: { ...preferences, mealSlots: [] } }), async () =>
      assert.fail("invalid dispatch"),
    ),
    { code: "invalid_request" },
  );
});
