import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mealClient } from "../src/meals/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const client = mealClient(
  "http://localhost/",
  account,
  Effect.succeed({ user: { id: id(1) }, access_token: "fixture", refresh_token: "fixture" }),
);
const command = {
  definitionId: "ABCDEF00-0000-4000-8000-000000000200",
  operationId: id(800),
  expectedRevision: "9007199254740993",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(800),
  definitionId: command.definitionId.toLowerCase(),
  revision: "9007199254740994",
};
const run = (body, fetch) =>
  Effect.runPromise(
    client.archiveRecipe(body).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );

test("native archive sends authenticated exact draft and rejects substituted receipts", async () => {
  assert.deepEqual(
    await run(command, async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/recipe/archive");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      assert.equal(new Headers(init.headers).get("x-nest-household"), id(10));
      assert.deepEqual(JSON.parse(init.body), command);
      return Response.json({ version: 1, receipt });
    }),
    receipt,
  );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(21) },
    { revision: "9007199254740995" },
    { definitionId: "bad" },
  ])
    await assert.rejects(
      run(command, async () => Response.json({ version: 1, receipt: { ...receipt, ...patch } })),
      (e) => e.code === "unavailable",
    );
  await assert.rejects(
    run({ ...command, actorId: id(2) }, () => assert.fail("Invalid command sent")),
    (e) => e.code === "invalid",
  );
});
