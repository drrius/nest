import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mealClient } from "../src/meals/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const credentials = { access_token: "fixture", refresh_token: "fixture", user: { id: id(1) } };
const client = mealClient("http://localhost/", account, Effect.succeed(credentials));
const command = {
  operationId: id(20),
  entryId: id(30),
  weekStart: "2030-01-07",
  expectedRevision: "9007199254740993",
  preparation: {
    title: "Soak beans",
    instructions: "Cold water",
    dueOn: "2030-01-06",
    assignment: { policy: "shared" },
  },
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(20),
  entryId: id(30),
  weekStart: command.weekStart,
  revision: command.expectedRevision,
  routineId: id(40),
  occurrenceId: id(41),
  routineVersion: "2030-01-07T12:00:00.123456Z",
  dueOn: command.preparation.dueOn,
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("native preparation writes exact commands and rejects misbound acknowledgments", async () => {
  assert.deepEqual(
    await run(client.createPreparation(command), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/preparation/create");
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
    { operationId: id(99) },
    { entryId: id(99) },
    { weekStart: "2030-01-14" },
    { revision: "9007199254740994" },
    { dueOn: "2030-01-07" },
    { hidden: true },
  ])
    await assert.rejects(
      run(client.createPreparation(command), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(client.createPreparation({ ...command, actorId: id(2) }), () => assert.fail("dispatched")),
    { code: "invalid" },
  );
});
test("native preparation reads bind even absent meal identities and retain unknown task states", async () => {
  const query = {
    entryId: id(30),
    weekStart: command.weekStart,
    revision: command.expectedRevision,
  };
  const value = { version: 1, householdId: id(10), ...query, entry: null, preparation: null };
  assert.deepEqual(
    await run(client.readPreparation(query), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/preparation");
      assert.deepEqual(Object.fromEntries(new URL(url).searchParams), query);
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      return Response.json(value);
    }),
    value,
  );
  for (const patch of [
    { entryId: id(99) },
    { revision: "0" },
    { weekStart: "2030-01-14" },
    { extra: true },
  ])
    await assert.rejects(
      run(client.readPreparation(query), async () => Response.json({ ...value, ...patch })),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(client.readPreparation(query), async () =>
      Response.json({ ...value, householdId: id(20) }),
    ),
    { code: "forbidden" },
  );
  const switched = mealClient(
    "http://localhost/",
    account,
    Effect.succeed({ ...credentials, user: { id: id(2) } }),
  );
  await assert.rejects(
    run(switched.readPreparation(query), () => assert.fail("dispatched")),
    { code: "session" },
  );
});
