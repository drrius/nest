import assert from "node:assert/strict";
import test from "node:test";
import { recurringRuntimeHandler } from "../../apps/api/recurring-runtime.mjs";

const environment = {
  NEST_RECURRING_WORKER_ENABLED: "true",
  NEST_SUPABASE_URL: "http://127.0.0.1:1",
  NEST_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  NEST_SUPABASE_RECURRING_SECRET: "sb_secret_private_fixture",
  NEST_RECURRING_SCHEDULER_TOKEN: "a".repeat(64),
};
const request = (suffix = "", options = {}) =>
  new Request(`http://localhost/internal/recurring/run${suffix}`, options);

test("disabled deployment does not read privileged configuration", async () => {
  for (const enabled of [undefined, "false", "TRUE", "1"]) {
    const config = new Proxy(
      {},
      {
        get: (_, key) => {
          if (key === "NEST_RECURRING_WORKER_ENABLED") return enabled;
          throw new Error("Privileged configuration must remain unread");
        },
      },
    );
    const result = await recurringRuntimeHandler(config)(request());
    assert.equal(result.status, 404);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.deepEqual(await result.json(), { error: "not_found" });
  }
});

test("enabled misconfiguration fails closed without exposing server material", async () => {
  const cases = [
    { NEST_SUPABASE_URL: undefined },
    { NEST_SUPABASE_URL: "https://private:secret@fixture.example" },
    { NEST_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private_fixture" },
    { NEST_SUPABASE_RECURRING_SECRET: "user-token-private" },
    { NEST_RECURRING_SCHEDULER_TOKEN: "weak-private" },
  ];
  for (const override of cases) {
    const response = await recurringRuntimeHandler({ ...environment, ...override })(request());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "unavailable" });
  }
});

test("enabled host preserves exact path, method, query and scheduler credential gates", async () => {
  const handler = recurringRuntimeHandler(environment);
  assert.equal((await handler(new Request("http://localhost/api/recurring"))).status, 404);
  assert.equal((await handler(request("", { method: "POST", body: "{}" }))).status, 405);
  assert.equal((await handler(request("?budget=100"))).status, 400);
  for (const bearer of [undefined, "user-token", environment.NEST_SUPABASE_RECURRING_SECRET]) {
    const headers = bearer ? { authorization: `Bearer ${bearer}` } : {};
    assert.equal((await handler(request("", { headers }))).status, 401);
  }
});
