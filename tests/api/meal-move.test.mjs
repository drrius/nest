import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { moveMeal } from "../../apps/api/src/meals/move.ts";
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
  sourceWeekStart: "2026-09-21",
  targetWeekStart: "2026-09-28",
  expectedSourceRevision: "9007199254740993",
  expectedTargetRevision: "0",
  date: "2026-09-30",
  slot: "lunch",
  entryId: "ABCDEF00-0000-4000-8000-000000000100",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: input.operationId.toLowerCase(),
  entryId: input.entryId.toLowerCase(),
  sourceWeekStart: input.sourceWeekStart,
  targetWeekStart: input.targetWeekStart,
  date: input.date,
  slot: input.slot,
  sourceRevision: "9007199254740994",
  targetRevision: "1",
};
const run = (value, fetch) =>
  Effect.runPromise(
    moveMeal(config, caller, value).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );

test("move binds actor, household, exact bigint revision and canonical retry identity", async () => {
  let calls = 0;
  assert.deepEqual(
    await run(input, async (url, init) => {
      calls++;
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_move_meal");
      assert.equal(new Headers(init.headers).get("authorization"), "Bearer fixture");
      const { operationId, ...payload } = input;
      assert.deepEqual(JSON.parse(init.body), {
        p_household: id(10),
        p_operation: operationId.toLowerCase(),
        p_input: { ...payload, entryId: payload.entryId.toLowerCase() },
      });
      return Response.json(receipt);
    }),
    receipt,
  );
  assert.equal(calls, 1);
});

test("invalid and injected move inputs fail before upstream dispatch", async () => {
  let calls = 0;
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { entryId: "bad" },
    { expectedSourceRevision: 0 },
    { sourceWeekStart: "2026-09-22" },
    { removed: true },
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
    { operationId: id(6) },
    { entryId: id(101) },
    { targetWeekStart: "2026-10-05" },
    { date: "2026-09-29" },
    { slot: "dinner" },
    { targetRevision: "2" },
    { sourceRevision: "9007199254740993" },
    { sourceRevision: "9007199254740995" },
    { sourceRevision: "0" },
    { entryId: "bad" },
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
