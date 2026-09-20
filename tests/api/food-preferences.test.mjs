import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { foodPreferences } from "../../apps/api/src/food/service.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = {
  token: "fixture-token",
  member: { userId: id(1), householdId: id(10), displayName: "Fixture" },
};
const service = foodPreferences(
  { url: "http://localhost/", publishableKey: "sb_publishable_fixture" },
  caller,
);
const preferences = { restrictions: ["Peanuts"], dislikes: [], calorieGoal: null, portions: 1 };
const row = { ...preferences, actorId: id(1), householdId: id(10), revision: "1" };
const command = { operationId: id(100), expectedRevision: "0", preferences };
const execute = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
const response = (value, range = "0-0/1") =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json", "content-range": range },
  });

test("private profile service validates actor, household, complete result range and revision", async () => {
  const cases = [
    [[{ ...row, actorId: id(2) }], "0-0/1"],
    [[{ ...row, householdId: id(20) }], "0-0/1"],
    [[{ ...row, revision: "0" }], "0-0/1"],
    [[{ ...row, revision: 1 }], "0-0/1"],
    [[row], "0-0/2"],
    [[row, row], "0-1/2"],
    [[], "*/1"],
  ];
  for (const [rows, range] of cases)
    await assert.rejects(
      execute(service.read(), () => Promise.resolve(response(rows, range))),
      { code: "unavailable" },
    );
  assert.equal(await execute(service.read(), () => Promise.resolve(response([], "*/0"))), null);
});

test("profile reads derive identity filters and never request partner records", async () => {
  const result = await execute(service.read(), (url, init) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get("actor_id"), `eq.${id(1)}`);
    assert.equal(query.get("household_id"), `eq.${id(10)}`);
    assert.equal(init.headers.authorization, "Bearer fixture-token");
    assert.equal(init.redirect, "error");
    return Promise.resolve(response([row]));
  });
  assert.deepEqual(result, { revision: "1", preferences });
});

test("profile save rejects wrong receipt identity, operation or revision", async () => {
  const receipt = { actorId: id(1), householdId: id(10), operationId: id(100), revision: "1" };
  for (const change of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(101) },
    { revision: "2" },
  ]) {
    await assert.rejects(
      execute(service.save(command), () => Promise.resolve(response({ ...receipt, ...change }))),
      { code: "unavailable" },
    );
  }
  assert.deepEqual(
    await execute(service.save(command), () => Promise.resolve(response(receipt))),
    receipt,
  );
});

test("invalid profile command fields fail before any mutation request", async () => {
  for (const input of [
    { ...command, actorId: id(2) },
    { ...command, preferences: { ...preferences, calorieGoal: 1.5 } },
    { ...command, preferences: { ...preferences, portions: 1.25 } },
    { ...command, preferences: { ...preferences, restrictions: Array(33).fill("x") } },
  ]) {
    let calls = 0;
    await assert.rejects(
      execute(service.save(input), () => {
        calls++;
        return Promise.resolve(response({}));
      }),
      { code: "invalid_request" },
    );
    assert.equal(calls, 0);
  }
});
