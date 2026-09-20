import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readMealWeek, mealWeekRoute } from "../../apps/api/src/meals/read.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const input = { weekStart: "2026-09-21" };
const snapshot = {
  version: 1,
  householdId: id(10),
  ...input,
  revision: "9007199254740993",
  entries: [],
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));

test("week reads bind the current household and exact requested week through one RPC", async () => {
  let calls = 0;
  assert.deepEqual(
    await run(readMealWeek(config, caller, input), async (url, init) => {
      calls++;
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_meal_week_snapshot");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_week_start: input.weekStart,
      });
      return Response.json(snapshot);
    }),
    snapshot,
  );
  assert.equal(calls, 1);
});

test("scope injection and malformed week queries fail before dispatch", async () => {
  for (const value of [
    { ...input, householdId: id(20) },
    { ...input, actorId: id(2) },
    { weekStart: "2026-09-22" },
    { weekStart: "9999-12-27" },
    {},
  ]) {
    await assert.rejects(
      run(readMealWeek(config, caller, value), () => assert.fail("dispatched")),
      { code: "invalid_request" },
    );
  }
  for (const query of [
    "",
    "weekStart=2026-09-21&weekStart=2026-09-28",
    "weekStart=2026-09-21&actorId=extra",
  ]) {
    await assert.rejects(
      run(
        mealWeekRoute(new Request(`http://localhost/v1/meals/week?${query}`), config, caller),
        () => assert.fail("dispatched"),
      ),
      { code: "invalid_request" },
    );
  }
});

test("well-shaped foreign or wrong-week replies and malformed snapshots are never exposed", async () => {
  for (const patch of [
    { householdId: id(20) },
    { weekStart: "2026-09-28" },
    { revision: 5 },
    { entries: [{}] },
    { privateTranscript: "unexpected" },
  ]) {
    await assert.rejects(
      run(readMealWeek(config, caller, input), async () =>
        Response.json({ ...snapshot, ...patch }),
      ),
      { code: "unavailable" },
    );
  }
  await assert.rejects(
    run(readMealWeek(config, caller, input), async () =>
      Response.json({ code: "42501" }, { status: 403 }),
    ),
    { code: "forbidden" },
  );
});
