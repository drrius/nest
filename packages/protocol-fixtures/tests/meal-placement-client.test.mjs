import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mealClient } from "../src/meals/client.ts";
import { placementTarget } from "../src/meals/placement-target.ts";
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
  date: "2026-10-06",
  slot: "lunch",
  title: "Pasta",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: command.operationId.toLowerCase(),
  entryId: id(30),
  weekStart: command.weekStart,
  date: command.date,
  slot: command.slot,
  revision: "9007199254740994",
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("native placement sends the immutable command with scoped bearer and validates exact bigint receipts", async () => {
  assert.deepEqual(
    await run(client.place(command), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/place");
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
    { date: "2026-10-07" },
    { slot: "dinner" },
    { revision: "9007199254740993" },
    { extra: true },
  ])
    await assert.rejects(
      run(client.place(command), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
});
test("invalid drafts and switched credentials cannot dispatch; offline failure never reports success", async () => {
  for (const patch of [{ title: " " }, { actorId: id(2) }, { date: "2026-10-12" }])
    await assert.rejects(
      run(client.place({ ...command, ...patch }), () => assert.fail("dispatched")),
      { code: "invalid" },
    );
  const switched = mealClient(
    "http://localhost/",
    account,
    Effect.succeed({ ...credentials, user: { id: id(2) } }),
  );
  await assert.rejects(
    run(switched.place(command), () => assert.fail("dispatched")),
    { code: "session" },
  );
  await assert.rejects(
    run(client.place(command), async () => {
      throw new Error("offline");
    }),
    { code: "unavailable" },
  );
});
test("placement links validate explicit dates and slots without accepting an out-of-week target", () => {
  const valid = { weekStart: command.weekStart, date: command.date, slot: command.slot };
  assert.deepEqual(placementTarget(valid), valid);
  for (const value of [
    {},
    { ...valid, date: "2026-10-12" },
    { ...valid, weekStart: [command.weekStart] },
    { ...valid, slot: "snack" },
    { ...valid, date: "2026-02-30" },
  ])
    assert.equal(placementTarget(value), null);
});
