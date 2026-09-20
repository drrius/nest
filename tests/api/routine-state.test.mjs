import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { setRoutineState } from "../../apps/api/src/routines/state.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const command = {
  operationId: id(200),
  routineId: id(100),
  expectedVersion: "2026-09-20T08:00:00.123456Z",
  action: "pause",
};
const receipt = {
  actorId: id(1),
  householdId: id(10),
  operationId: id(200),
  routineId: id(100),
  version: "2026-09-20T08:00:00.123457Z",
  action: "pause",
};
const run = (input, fetch) =>
  Effect.runPromise(
    setRoutineState(
      { url: "http://localhost/", publishableKey: "sb_publishable_fixture" },
      caller,
      input,
    ).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );
const response = (value) => Promise.resolve(Response.json(value));

test("lifecycle sends only the requested action and exact microsecond baseline with verified scope", async () => {
  assert.deepEqual(
    await run(command, (url, init) => {
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_set_routine_state");
      assert.equal(init.headers.authorization, "Bearer fixture");
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_operation: id(200),
        p_routine: id(100),
        p_expected: command.expectedVersion,
        p_action: command.action,
      });
      return response(receipt);
    }),
    receipt,
  );
});

test("lifecycle rejects mismatched receipt identity, action, routine and unknown fields", async () => {
  for (const change of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(201) },
    { routineId: id(101) },
    { action: "create" },
    { secret: true },
    { version: "2026-09-20T08:00:00.123Z" },
  ])
    await assert.rejects(
      run(command, () => response({ ...receipt, ...change })),
      { code: "unavailable" },
    );
});

test("invalid lifecycle commands cannot reach the database transport", async () => {
  for (const change of [
    { actorId: id(2) },
    { householdId: id(20) },
    { action: "delete" },
    { action: "PAUSE" },
    { action: null },
    { expectedVersion: command.expectedVersion + "\n" },
  ]) {
    let calls = 0;
    await assert.rejects(
      run({ ...command, ...change }, () => {
        calls++;
        return response(receipt);
      }),
      { code: "invalid_request" },
    );
    assert.equal(calls, 0);
  }
});

test("database conflicts are distinguished from uncertain backend failures without leaking details", async () => {
  for (const [code, expected] of [
    ["40001", "conflict"],
    ["55P03", "conflict"],
    ["55000", "conflict"],
    ["22023", "invalid_request"],
    ["XX000", "unavailable"],
  ]) {
    await assert.rejects(
      run(command, () =>
        Promise.resolve(
          Response.json({ code, message: "private database detail" }, { status: 500 }),
        ),
      ),
      (error) => error.code === expected && !String(error).includes("private database detail"),
    );
  }
});
