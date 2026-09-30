import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mealClient } from "../src/meals/client.ts";
import { removalTarget } from "../src/meals/removal-target.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const credentials = {
  access_token: "fixture",
  refresh_token: "fixture",
  user: { id: account.actor },
};
const client = mealClient("http://localhost/", account, Effect.succeed(credentials));
const command = {
  operationId: "ABCDEF00-0000-4000-8000-000000000020",
  weekStart: "2026-10-05",
  expectedRevision: "9007199254740993",
  entryId: "ABCDEF00-0000-4000-8000-000000000030",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: command.operationId.toLowerCase(),
  entryId: command.entryId.toLowerCase(),
  weekStart: command.weekStart,
  removed: true,
  skippedPreparationId: null,
  revision: "9007199254740994",
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("native removal sends the immutable command with scoped bearer and validates exact bigint receipts", async () => {
  assert.deepEqual(
    await run(client.remove(command), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/remove");
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
    { operationId: id(9) },
    { weekStart: "2026-10-12" },
    { entryId: id(31) },
    { removed: false },
    { revision: "9007199254740993" },
    { extra: true },
  ])
    await assert.rejects(
      run(client.remove(command), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
});
test("invalid drafts and switched credentials cannot dispatch; offline failure never reports success", async () => {
  for (const patch of [{ entryId: "bad" }, { actorId: id(2) }, { weekStart: "2026-10-06" }])
    await assert.rejects(
      run(client.remove({ ...command, ...patch }), () => assert.fail("dispatched")),
      { code: "invalid" },
    );
  const switched = mealClient(
    "http://localhost/",
    account,
    Effect.succeed({ ...credentials, user: { id: id(2) } }),
  );
  await assert.rejects(
    run(switched.remove(command), () => assert.fail("dispatched")),
    { code: "session" },
  );
  await assert.rejects(
    run(client.remove(command), async () => {
      throw new Error("offline");
    }),
    { code: "unavailable" },
  );
});
test("removal links validate week and canonicalize entry identity", () => {
  const valid = { weekStart: command.weekStart, entryId: command.entryId };
  assert.deepEqual(removalTarget(valid), { ...valid, entryId: valid.entryId.toLowerCase() });
  for (const value of [
    {},
    { ...valid, entryId: "bad" },
    { ...valid, weekStart: [command.weekStart] },
    { ...valid, weekStart: "2026-10-06" },
  ])
    assert.equal(removalTarget(value), null);
});
