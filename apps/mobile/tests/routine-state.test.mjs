import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { routineClient } from "../src/routines/client.ts";
import { RoutineRuntime } from "../src/routines/runtime.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const credentials = Effect.succeed({ user: { id: id(1) }, access_token: "fixture" });
const client = routineClient("https://fixture.invalid/", account, credentials);
const routine = { routineId: id(50), version: "2026-09-20T08:00:00.123456Z" };
const input = {
  operationId: id(100),
  routineId: routine.routineId,
  expectedVersion: routine.version,
  action: "pause",
};
const receipt = {
  actorId: account.actor,
  householdId: account.household,
  operationId: input.operationId,
  routineId: routine.routineId,
  version: routine.version,
  action: "pause",
};
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
const failure = (code) => Effect.fail(new PreferenceFailure({ code }));
test("lifecycle client binds each action, scope and exact attempt receipt", async () => {
  for (const action of ["pause", "resume", "archive"]) {
    const command = { ...input, action };
    assert.deepEqual(
      await run(client.setState(command), async (url, init) => {
        assert.equal(new URL(url).pathname, "/v1/routines/state");
        assert.deepEqual(JSON.parse(init.body), command);
        return Response.json({ version: 1, receipt: { ...receipt, action } });
      }),
      { ...receipt, action },
    );
  }
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(11) },
    { operationId: id(101) },
    { routineId: id(51) },
    { action: "resume" },
  ])
    await assert.rejects(
      run(client.setState(input), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
});
test("lifecycle rejects hidden scope, invalid actions and switched credentials before dispatch", async () => {
  for (const patch of [
    { householdId: id(11) },
    { action: "delete" },
    { expectedVersion: "yesterday" },
  ])
    await assert.rejects(
      run(client.setState({ ...input, ...patch }), () => assert.fail("dispatch")),
      { code: "invalid" },
    );
  const wrong = routineClient(
    "https://fixture.invalid/",
    account,
    Effect.succeed({ user: { id: id(2) }, access_token: "wrong" }),
  );
  await assert.rejects(
    run(wrong.setState(input), () => assert.fail("dispatch")),
    { code: "session" },
  );
});
test("lost lifecycle acknowledgment freezes version and action and blocks replacement writes", async () => {
  const calls = [];
  let reads = 0;
  const runtime = new RoutineRuntime(
    {
      read: () => {
        reads++;
        return Effect.succeed({ routines: [] });
      },
      create: () => assert.fail("replacement create"),
      edit: () => assert.fail("replacement edit"),
      setState: (command) => {
        calls.push(command);
        return calls.length === 1 ? failure("unavailable") : Effect.succeed(receipt);
      },
    },
    () => id(100),
  );
  await runtime.load();
  const original = { ...routine };
  await runtime.setState(original, "pause");
  original.version = "2026-09-20T09:00:00.000000Z";
  await runtime.setState(original, "archive");
  await runtime.edit(original, { title: "Changed" });
  await runtime.create({});
  await runtime.load();
  assert.equal(reads, 1);
  assert.equal(runtime.getSnapshot().stage, "uncertain");
  await runtime.retry();
  assert.deepEqual(calls, [input, input]);
  assert.equal(runtime.getSnapshot().saved, 1);
});
test("confirmed archive reloads without another mutation; denial wipes the scoped snapshot", async () => {
  let reads = 0,
    writes = 0;
  const runtime = new RoutineRuntime(
    {
      read: () => (++reads === 2 ? failure("unavailable") : Effect.succeed({ routines: [] })),
      setState: () => {
        writes++;
        return Effect.succeed({ ...receipt, action: "archive" });
      },
    },
    () => id(100),
  );
  await runtime.load();
  await runtime.setState(routine, "archive");
  assert.equal(runtime.getSnapshot().stage, "reload");
  await runtime.retry();
  await runtime.load();
  assert.equal(writes, 1);
  assert.equal(runtime.getSnapshot().saved, 1);
  const denied = new RoutineRuntime(
    {
      read: () => Effect.succeed({ routines: [routine] }),
      setState: () => failure("forbidden"),
    },
    () => id(100),
  );
  await denied.load();
  await denied.setState(routine, "pause");
  assert.equal(denied.getSnapshot().snapshot, null);
  assert.equal(denied.getSnapshot().stage, "verify");
});
