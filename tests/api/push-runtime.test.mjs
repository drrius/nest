import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { pushRuntimeHandler } from "../../apps/api/push-runtime.mjs";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const environment = {
  NEST_PUSH_WORKER_ENABLED: "true",
  NEST_SUPABASE_URL: "http://127.0.0.1:1",
  NEST_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  NEST_SUPABASE_PUSH_SECRET: "sb_secret_fixture",
  NEST_APNS_ENVIRONMENT: "production",
  NEST_APNS_KEY_ID: "ABCDEFGHIJ",
  NEST_APNS_TEAM_ID: "0123456789",
  NEST_APNS_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }),
  NEST_PUSH_SCHEDULER_TOKEN: "a".repeat(64),
};
const request = (options = {}) =>
  new Request("https://nest.example/internal/push/run", { method: "POST", ...options });

test("disabled push endpoint does not inspect credentials", async () => {
  const handler = pushRuntimeHandler(
    new Proxy(
      {},
      {
        get: (_, key) => {
          if (key === "NEST_PUSH_WORKER_ENABLED") return "false";
          throw new Error("Do not read credentials while disabled");
        },
      },
    ),
  );
  assert.equal((await handler(request())).status, 404);
});

test("missing or malformed provider configuration stays private", async () => {
  for (const change of [
    { NEST_APNS_PRIVATE_KEY: "invalid-private-key" },
    { NEST_APNS_ENVIRONMENT: "invalid" },
    { NEST_PUSH_SCHEDULER_TOKEN: "weak-private-token" },
  ]) {
    const response = await pushRuntimeHandler({ ...environment, ...change })(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "unavailable" });
  }
});

test("public and wrong-credential calls cannot invoke database or Apple", async () => {
  const handler = pushRuntimeHandler(environment);
  for (const token of [undefined, "user-session", environment.NEST_SUPABASE_PUSH_SECRET]) {
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    assert.equal((await handler(request({ headers }))).status, 401);
  }
  assert.equal((await handler(request({ method: "GET" }))).status, 405);
  const response = await handler(
    new Request("https://nest.example/internal/push/run?token=bad", {
      method: "POST",
    }),
  );
  assert.equal(response.status, 400);
});
