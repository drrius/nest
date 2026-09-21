import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mealClient } from "../src/meals/client.ts";
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
  sourceWeekStart: "2026-10-05",
  expectedSourceRevision: "9007199254740993",
  targetWeekStart: "2026-10-12",
  expectedTargetRevision: "9007199254740993",
  date: "2026-10-13",
  slot: "dinner",
  entryId: "ABCDEF00-0000-4000-8000-000000000030",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: command.operationId.toLowerCase(),
  entryId: id(40),
  sourceEntryId: command.entryId.toLowerCase(),
  sourceWeekStart: command.sourceWeekStart,
  targetWeekStart: command.targetWeekStart,
  date: command.date,
  slot: command.slot,
  targetRevision: "9007199254740994",
  sourceRevision: "9007199254740993",
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("native leftovers send the immutable command with scoped bearer and validates exact bigint receipts", async () => {
  assert.deepEqual(
    await run(client.placeLeftovers(command), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/leftovers");
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
    { sourceWeekStart: "2026-10-12" },
    { sourceEntryId: id(31) },
    { entryId: command.entryId.toLowerCase() },
    { targetWeekStart: "2026-10-19" },
    { date: "2026-10-14" },
    { slot: "lunch" },
    { targetRevision: "9007199254740993" },
    { sourceRevision: "9007199254740994" },
    { extra: true },
  ])
    await assert.rejects(
      run(client.placeLeftovers(command), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
});
test("invalid drafts and switched credentials cannot dispatch; offline failure never reports success", async () => {
  for (const patch of [{ entryId: "bad" }, { actorId: id(2) }, { sourceWeekStart: "2026-10-06" }])
    await assert.rejects(
      run(client.placeLeftovers({ ...command, ...patch }), () => assert.fail("dispatched")),
      { code: "invalid" },
    );
  const switched = mealClient(
    "http://localhost/",
    account,
    Effect.succeed({ ...credentials, user: { id: id(2) } }),
  );
  await assert.rejects(
    run(switched.placeLeftovers(command), () => assert.fail("dispatched")),
    { code: "session" },
  );
  await assert.rejects(
    run(client.placeLeftovers(command), async () => {
      throw new Error("offline");
    }),
    { code: "unavailable" },
  );
});
test("same-week leftovers advance the shared baseline exactly once", async () => {
  const input = { ...command, targetWeekStart: command.sourceWeekStart, date: "2026-10-06" };
  const result = {
    ...receipt,
    targetWeekStart: input.targetWeekStart,
    date: input.date,
    sourceRevision: "9007199254740994",
  };
  assert.deepEqual(
    await run(client.placeLeftovers(input), async () =>
      Response.json({ version: 1, receipt: result }),
    ),
    result,
  );
  await assert.rejects(
    run(client.placeLeftovers(input), async () =>
      Response.json({
        version: 1,
        receipt: { ...result, sourceRevision: command.expectedSourceRevision },
      }),
    ),
    { code: "unavailable" },
  );
});
