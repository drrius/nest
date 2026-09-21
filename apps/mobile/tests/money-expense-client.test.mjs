import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { expenseClient } from "../src/money/expense-client.ts";
import { id, payload } from "../../../tests/database/native-expense-helpers.mjs";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const credentials = Effect.succeed({ user: { id: id(1) }, access_token: "fixture" });
const client = expenseClient("http://localhost/", { actor: id(1), household: id(10) }, credentials);
const command = { operationId: id(100), expense: payload() };
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  eventId: id(101),
  approvalId: null,
  expense: payload(),
};
const run = (value, input = command) =>
  Effect.runPromise(
    client
      .saveExpense(input)
      .pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value))),
  );
test("native Save only accepts its direct actor-bound exact expense receipt", async () => {
  assert.deepEqual(await run(receipt), receipt);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(102) },
    { approvalId: id(103) },
    { expense: payload({ note: "Other" }) },
    { unexpected: true },
  ])
    await assert.rejects(run({ ...receipt, ...patch }), { code: "unavailable" });
  let calls = 0;
  await assert.rejects(
    Effect.runPromise(
      client.saveExpense({ ...command, approvalId: id(103) }).pipe(
        Effect.provideService(Fetch.Fetch, async () => {
          calls++;
          return Response.json(receipt);
        }),
      ),
    ),
    { code: "invalid" },
  );
  assert.equal(calls, 0);
});
