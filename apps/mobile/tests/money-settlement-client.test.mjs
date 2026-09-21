import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as Fetch from "effect/unstable/http/FetchHttpClient";
import { settlementClient } from "../src/money/settlement-client.ts";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
import { settlement } from "../../../tests/integration/settlement-api-fixture.mjs";
const client = settlementClient(
  "http://localhost/",
  { actor: id(1), household: id(10) },
  Effect.succeed({ user: { id: id(1) }, access_token: "fixture" }),
);
const command = { operationId: id(100), settlement: settlement() },
  receipt = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(100),
    eventId: id(101),
    approvalId: null,
    settlement: settlement(),
  };
const run = (value, input = command) =>
  Effect.runPromise(
    client
      .saveSettlement(input)
      .pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value))),
  );
test("native settlement Save only accepts its exact actor-bound unapproved receipt", async () => {
  assert.deepEqual(await run(receipt), receipt);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(200) },
    { approvalId: id(201) },
    { settlement: settlement({ note: "Changed" }) },
    { extra: true },
  ])
    await assert.rejects(run({ ...receipt, ...patch }), { code: "unavailable" });
  await assert.rejects(run(receipt, { ...command, approvalId: id(201) }), { code: "invalid" });
});
