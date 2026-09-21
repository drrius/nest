import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  readMealPreparation,
  mealPreparationRoute,
} from "../../apps/api/src/meals/preparation-read.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const input = { entryId: id(100), weekStart: "2030-01-07", revision: "9007199254740993" };
const preparation = {
  routineId: id(200),
  occurrenceId: id(201),
  routineVersion: "2030-01-07T12:00:00.123456Z",
  title: "🍲".repeat(120),
  instructions: "🍲".repeat(4000),
  dueOn: "2030-01-06",
  assignment: { policy: "shared" },
  plannedAssigneeId: null,
  status: "open",
  state: "active",
};
const value = {
  version: 1,
  householdId: id(10),
  ...input,
  entry: { entryId: id(100), date: "2030-01-07", title: "Soup" },
  preparation,
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("preparation reads bind exact meal scope and preserve complete legacy instructions", async () => {
  assert.deepEqual(
    await run(readMealPreparation(config, caller, input), async (url, init) => {
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_meal_preparation");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_week: input.weekStart,
        p_revision: input.revision,
        p_entry: input.entryId,
      });
      return Response.json(value);
    }),
    value,
  );
  for (const patch of [
    { householdId: id(20) },
    { entryId: id(999) },
    { weekStart: "2030-01-14" },
    { revision: "0" },
    { entry: { ...value.entry, entryId: id(999) } },
    { entry: { ...value.entry, date: "2030-01-14" } },
    { entry: null },
    { preparation: { ...preparation, instructions: "🍲".repeat(4001) } },
    { hidden: true },
  ])
    await assert.rejects(
      run(readMealPreparation(config, caller, input), async () =>
        Response.json({ ...value, ...patch }),
      ),
      { code: "unavailable" },
    );
  for (const result of [
    { ...value, preparation: null },
    { ...value, entry: null, preparation: null },
  ])
    assert.deepEqual(
      await run(readMealPreparation(config, caller, input), async () => Response.json(result)),
      result,
    );
});
test("read queries reject unknown, duplicate and invalid baselines before upstream dispatch", async () => {
  for (const suffix of ["&revision=1", "&actorId=" + id(2), "&extra=true"])
    await assert.rejects(
      run(
        mealPreparationRoute(
          new Request("http://localhost/?" + new URLSearchParams(input) + suffix),
          config,
          caller,
        ),
        () => assert.fail("dispatched"),
      ),
      { code: "invalid_request" },
    );
  for (const patch of [{ revision: 0 }, { entryId: "bad" }, { weekStart: "2030-01-08" }])
    await assert.rejects(
      run(readMealPreparation(config, caller, { ...input, ...patch }), () =>
        assert.fail("dispatched"),
      ),
      { code: "invalid_request" },
    );
});
