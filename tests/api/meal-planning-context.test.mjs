import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { mealPlanningContextReader } from "../../apps/api/src/meal-planning/read-context.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = require("effect/Effect"),
  Redacted = require("effect/Redacted");
const FetchHttpClient = require("effect/unstable/http/FetchHttpClient");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const secret = "sb_secret_fixture";
const read = mealPlanningContextReader(config, Redacted.make(secret));
const value = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  stateHash: "a".repeat(64),
  members: [
    { actorId: id(1), profile: null },
    { actorId: id(2), profile: null },
  ],
  cooking: null,
  requesterCalorieGoal: null,
};
const request = (headers = {}) =>
  new Request("http://nest.local/", { headers: { authorization: "Bearer user", ...headers } });
function run(req, respond) {
  return Effect.runPromise(
    read(req).pipe(
      Effect.provideService(FetchHttpClient.Fetch, async (url, init) => {
        const headers = new Headers(init.headers),
          path = new URL(url).pathname;
        assert.equal(init.redirect, "error");
        if (path === "/rest/v1/rpc/nest_meal_planning_context") {
          assert.equal(headers.get("apikey"), secret);
          assert.equal(headers.get("authorization"), null);
          assert.deepEqual(JSON.parse(init.body), { p_actor: id(1), p_household: id(10) });
          return respond();
        }
        assert.equal(headers.get("apikey"), config.publishableKey);
        assert.equal(headers.get("authorization"), "Bearer user");
        return Response.json(
          path === "/auth/v1/user"
            ? { id: id(1) }
            : [{ user_id: id(1), household_id: id(10), display_name: "A" }],
        );
      }),
    ),
  );
}

test("planning service isolates privileged credentials and binds decoded context to verified membership", async () => {
  assert.deepEqual(await run(request(), () => Response.json(value)), value);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { privateChat: "Must not escape" },
    { members: [] },
  ]) {
    await assert.rejects(
      run(request(), () => Response.json({ ...value, ...patch })),
      { code: "unavailable" },
    );
  }
  await assert.rejects(
    run(request(), () => {
      throw new Error(`${secret} private upstream detail`);
    }),
    (error) => {
      assert.equal(error.code, "unavailable");
      assert.equal(JSON.stringify(error).includes(secret), false);
      return true;
    },
  );
});

test("unverified and cross-household requests never dispatch the privileged projection", async () => {
  const never = () => assert.fail("Privileged request before authorization");
  await assert.rejects(run(new Request("http://nest.local/"), never), { code: "unauthenticated" });
  await assert.rejects(run(request({ "x-nest-household": id(20) }), never), { code: "forbidden" });
  assert.throws(
    () =>
      mealPlanningContextReader(
        { ...config, url: "https://example.com@attacker.test/path" },
        Redacted.make(secret),
      ),
    /origin without credentials/,
  );
});
