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
  routineId: id(40),
  expectedRoutineVersion: "2030-01-07T12:00:00.123455Z",
  patch: {
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
  dueOn: command.patch.dueOn,
  previousRoutineVersion: command.expectedRoutineVersion,
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
test("native preparation writes exact commands and rejects misbound acknowledgments", async () => {
  assert.deepEqual(
    await run(client.editPreparation(command), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/preparation/edit");
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
    { routineId: id(99) },
    { previousRoutineVersion: "2030-01-07T12:00:00.123454Z" },
    { routineVersion: command.expectedRoutineVersion },
    { hidden: true },
  ])
    await assert.rejects(
      run(client.editPreparation(command), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(client.editPreparation({ ...command, actorId: id(2) }), () => assert.fail("dispatched")),
    { code: "invalid" },
  );
});
