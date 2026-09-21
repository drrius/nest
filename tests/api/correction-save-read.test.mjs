import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  readCorrectionSave,
  cancelCorrectionSave,
} from "../../apps/api/src/money/correction-save-read.ts";
import { id } from "../database/native-expense-helpers.mjs";
import { correction as payload } from "../integration/correction-api-fixture.mjs";
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
  reversalEventId: id(101),
  replacementEventId: null,
  approvalId: null,
  correction: payload(id(400)),
};
const result = (status, value = null) => ({
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  status,
  receipt: value,
});
const run = (value, input = { operationId: id(100) }, cancel = false) =>
  Effect.runPromise(
    (cancel ? cancelCorrectionSave : readCorrectionSave)(config, caller, input).pipe(
      Effect.provideService(Fetch.Fetch, async () => Response.json(value)),
    ),
  );
test("correction Save recovery binds immutable receipt identity and terminal status", async () => {
  for (const value of [result("recorded", receipt), result("unresolved"), result("cancelled")])
    assert.deepEqual(await run(value), value);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(102) },
    { approvalId: id(103) },
    { hidden: true },
  ])
    await assert.rejects(run(result("recorded", { ...receipt, ...patch })), {
      code: "unavailable",
    });
  for (const value of [
    result("recorded"),
    result("cancelled", receipt),
    { ...result("unresolved"), actorId: id(2) },
    { ...result("unresolved"), hidden: true },
  ])
    await assert.rejects(run(value), { code: "unavailable" });
  await assert.rejects(run(result("unresolved"), { operationId: id(100), actorId: id(2) }), {
    code: "invalid_request",
  });
  await assert.rejects(run(result("unresolved"), { operationId: "bad" }), {
    code: "invalid_request",
  });
});
test("correction cancellation accepts only a terminal owner-bound outcome", async () => {
  for (const value of [result("cancelled"), result("recorded", receipt)])
    assert.deepEqual(await run(value, undefined, true), value);
  await assert.rejects(run(result("unresolved"), undefined, true), { code: "unavailable" });
});
