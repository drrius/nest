import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { replaceMeal } from "../../apps/api/src/meals/replacement.ts";
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
  entryId: "ABCDEF00-0000-4000-8000-000000000003",
  weekStart: "2026-09-21",
  expectedRevision: "9007199254740993",
  date: "2026-09-22",
  slot: "dinner",
  title: "Pasta",
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: input.operationId.toLowerCase(),
  entryId: id(100),
  previousEntryId: input.entryId.toLowerCase(),
  skippedPreparationId: null,
  weekStart: input.weekStart,
  date: input.date,
  slot: input.slot,
  revision: "9007199254740995",
};
const run = (value, fetch) =>
  Effect.runPromise(
    replaceMeal(config, caller, value).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  );

test("replacement binds actor, household, exact bigint revision and canonical retry identity", async () => {
  let calls = 0;
  assert.deepEqual(
    await run(input, async (url, init) => {
      calls++;
      assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_replace_meal");
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

test("invalid and injected replacement inputs fail before upstream dispatch", async () => {
  let calls = 0;
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { title: " " },
    { title: "\ud800" },
    { title: "a\u0000b" },
    { expectedRevision: 0 },
    { date: "2026-09-28" },
    { date: "2026-02-30" },
    { weekStart: "2026-09-22" },
    { slot: "snack" },
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
    { date: "2026-09-23" },
    { weekStart: "2026-09-28" },
    { slot: "lunch" },
    { revision: "9007199254740993" },
    { revision: "9007199254740994" },
    { previousEntryId: id(5) },
    { entryId: input.entryId.toLowerCase() },
    { skippedPreparationId: "bad" },
    { revision: "0" },
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
