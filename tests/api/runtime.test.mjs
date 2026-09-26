import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimeHandler } from "../../apps/api/runtime.mjs";

const environment = {
  NEST_SUPABASE_URL: "https://fixture.example",
  NEST_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
};

test("deployment startup fails closed for absent configuration or a server key", () => {
  assert.throws(() => runtimeHandler({}), /Configure/);
  assert.throws(
    () => runtimeHandler({ ...environment, NEST_SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture" }),
    /publishable key/,
  );
});

test("deployment runtime retains authentication and method gates without model credentials", async () => {
  const handler = runtimeHandler(environment);
  assert.equal((await handler(new Request("https://nest.example/v1/session"))).status, 401);
  assert.equal(
    (await handler(new Request("https://nest.example/v1/money/recurring/approval"))).status,
    401,
  );
  assert.equal(
    (await handler(new Request("https://nest.example/v1/chores", { method: "POST" }))).status,
    405,
  );
});
