import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { editMealPreparation } from "../../apps/api/src/meals/preparation-edit.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const input = {
  operationId: "ABCDEF00-0000-4000-8000-000000000004",
  entryId: "ABCDEF00-0000-4000-8000-000000000100",
  weekStart: "2030-01-07",
  expectedRevision: "9007199254740993",
  routineId: id(200),
  expectedRoutineVersion: "2030-01-07T12:00:00.123455Z",
  patch: {
    title: "Soak beans",
    instructions: null,
    dueOn: "2030-01-06",
    assignment: { policy: "shared" },
  },
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: input.operationId.toLowerCase(),
  entryId: input.entryId.toLowerCase(),
  weekStart: input.weekStart,
  revision: input.expectedRevision,
  routineId: id(200),
  occurrenceId: id(201),
  routineVersion: "2030-01-07T12:00:00.123456Z",
  dueOn: input.patch.dueOn,
  previousRoutineVersion: input.expectedRoutineVersion,
};
const run = (value, fetch) =>
  Effect.runPromise(
    editMealPreparation(config, caller, value).pipe(
      Effect.provideService(FetchHttpClient.Fetch, fetch),
    ),
  );

test("preparation editing binds actor, household, exact bigint revision and canonical retry identity", async () => {
  let calls = 0;
  assert.deepEqual(
    await run(input, async (url, init) => {
      calls++;
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_edit_meal_preparation");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      const { operationId, ...payload } = input;
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_operation: operationId.toLowerCase(),
        p_input: {
          ...payload,
          entryId: payload.entryId.toLowerCase(),
          routineId: payload.routineId.toLowerCase(),
        },
      });
      return Response.json(receipt);
    }),
    receipt,
  );
  assert.equal(calls, 1);
});

test("invalid and injected preparation inputs fail before upstream dispatch", async () => {
  let calls = 0;
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { entryId: "bad" },
    { expectedRevision: 0 },
    { weekStart: "2026-09-22" },
    { removed: true },
    { patch: {} },
    { patch: { schedule: { kind: "daily" } } },
    { patch: { instructions: "\uD800" } },
  ]) {
    await assert.rejects(
      run({ ...input, ...patch }, async () => {
        calls++;
        return Response.json(receipt);
      }),
      (error) => error.code === "invalid_request",
    );
  }
  assert.equal(calls, 0);
});

test("misbound or malformed receipts cannot report success; conflicts and auth errors remain distinct", async () => {
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { previousRoutineVersion: "2030-01-07T12:00:00.123454Z" },
    { routineId: id(299) },
    { routineVersion: input.expectedRoutineVersion },
    { operationId: id(6) },
    { entryId: id(101) },
    { weekStart: "2030-01-14" },
    { dueOn: "2030-01-07" },
    { revision: "9007199254740994" },
    { routineId: "bad" },
    { routineVersion: "2030-01-07T12:00:00.123Z" },
    { private: "excess" },
  ])
    await assert.rejects(
      run(input, async () => Response.json({ ...receipt, ...patch })),
      (error) => error.code === "unavailable",
    );
  for (const [code, status, expected] of [
    ["40001", 409, "conflict"],
    ["42501", 403, "forbidden"],
    ["22023", 400, "invalid_request"],
  ])
    await assert.rejects(
      run(input, async () => Response.json({ code }, { status })),
      (error) => error.code === expected,
    );
});
