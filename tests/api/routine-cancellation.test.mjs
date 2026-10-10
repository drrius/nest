import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { routineRoute } from "../../apps/api/src/routines/route.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Http = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "Test" },
  token: "fixture",
};
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const command = {
  operationId: id(100),
  definition: { title: "Tidy", schedule: { kind: "daily" }, assignment: { policy: "shared" } },
};
const cancelled = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  status: "cancelled",
  receipt: null,
};
const receipt = {
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  routineId: id(200),
  version: "2026-09-28T09:00:00.123456Z",
  action: "create",
};
const run = (result, input = command) =>
  Effect.runPromise(
    routineRoute(
      new Request("http://localhost/v1/routines/cancel-create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
      config,
      caller,
    ).pipe(
      Effect.provideService(Http.Fetch, async (url, init) => {
        assert.equal(String(url), "http://localhost/rest/v1/rpc/nest_cancel_routine_creation");
        assert.deepEqual(JSON.parse(init.body), {
          p_household: id(10),
          p_operation: id(100),
          p_definition: command.definition,
        });
        return Response.json(result);
      }),
    ),
  );
test("cancellation routes exact command and validates outcome identity", async () => {
  assert.deepEqual(await run(cancelled), cancelled);
  const recorded = { ...cancelled, status: "recorded", receipt };
  assert.deepEqual(await run(recorded), recorded);
  for (const change of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(101) },
    { status: "recorded" },
    { receipt },
  ])
    await assert.rejects(run({ ...cancelled, ...change }));
  for (const change of [{ actorId: id(2) }, { operationId: id(101) }, { action: "edit" }])
    await assert.rejects(run({ ...recorded, receipt: { ...receipt, ...change } }));
  await assert.rejects(run(cancelled, { ...command, actorId: id(2) }));
});
