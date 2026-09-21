import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readExpenseSave } from "../../apps/api/src/money/expense-save-read.ts";
import { id, payload } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const config = { url: "http://localhost/", publishableKey: "fixture" };
const caller = {
  token: "fixture",
  member: { userId: id(1), householdId: id(10), displayName: "A" },
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  eventId: id(101),
  approvalId: null,
  expense: payload(),
};
const run = (rows, input = { operationId: id(100) }) =>
  Effect.runPromise(
    readExpenseSave(config, caller, input).pipe(
      Effect.provideService(Fetch.Fetch, async () => Response.json(rows)),
    ),
  );
test("expense Save recovery binds immutable receipt identity and cannot claim an approved execution as native Save", async () => {
  assert.deepEqual((await run([{ result: receipt }])).receipt, receipt);
  assert.equal((await run([])).receipt, null);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(102) },
    { approvalId: id(103) },
    { hidden: true },
  ])
    await assert.rejects(run([{ result: { ...receipt, ...patch } }]), { code: "unavailable" });
  await assert.rejects(run([{ result: receipt }, { result: receipt }]), { code: "unavailable" });
  await assert.rejects(run([], { operationId: id(100), actorId: id(2) }), {
    code: "invalid_request",
  });
  await assert.rejects(run([], { operationId: "bad" }), { code: "invalid_request" });
});
