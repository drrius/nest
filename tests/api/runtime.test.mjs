import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimeHandler, runtimeModel } from "../../apps/api/runtime.mjs";

const environment = {
  NEST_SUPABASE_URL: "https://fixture.example",
  NEST_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
};

test("deployment identity alone cannot enable AI; a model and explicit auth are required", () => {
  const model = { NEST_AI_MODEL: "fixture/model", VERCEL_OIDC_TOKEN: "fixture-token" };
  assert.equal(runtimeModel(model), undefined);
  assert.equal(runtimeModel({ NEST_AI_AUTH: "vercel-oidc" }), undefined);
  assert.equal(runtimeModel({ ...model, NEST_AI_AUTH: "typo" }), undefined);
  assert.equal(runtimeModel({ ...model, NEST_AI_AUTH: "vercel-oidc" }).modelId, "fixture/model");
  assert.equal(
    runtimeModel({ ...model, NEST_AI_AUTH: "vercel-oidc", NEST_AI_REASONING_EFFORT: "high" })
      .modelId,
    "fixture/model",
  );
  assert.throws(
    () =>
      runtimeModel({ ...model, NEST_AI_AUTH: "vercel-oidc", NEST_AI_REASONING_EFFORT: "unknown" }),
    /reasoning effort/,
  );
  assert.equal(
    runtimeModel({ ...model, AI_GATEWAY_API_KEY: "fixture-key" }).modelId,
    "fixture/model",
  );
});

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
