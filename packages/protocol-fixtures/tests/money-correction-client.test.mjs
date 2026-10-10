import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { correctionClient } from "../src/money/correction-client.ts";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
import { correction } from "../../../tests/integration/correction-api-fixture.mjs";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const credentials = Effect.succeed({ user: { id: id(1) }, access_token: "fixture" });
const client = correctionClient(
  "http://localhost/",
  { actor: id(1), household: id(10) },
  credentials,
);
const payload = (patch = {}) => correction(id(400), patch);
const command = { operationId: id(100), correction: payload() };
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  reversalEventId: id(101),
  replacementEventId: null,
  approvalId: null,
  correction: payload(),
};
const run = (value, input = command) =>
  Effect.runPromise(
    client
      .saveCorrection(input)
      .pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value))),
  );
test("native Save only accepts its direct actor-bound exact correction receipt", async () => {
  assert.deepEqual(await run(receipt), receipt);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(102) },
    { approvalId: id(103) },
    { correction: payload({ sourceEventId: id(401) }) },
    { unexpected: true },
  ])
    await assert.rejects(run({ ...receipt, ...patch }), { code: "unavailable" });
  let calls = 0;
  await assert.rejects(
    Effect.runPromise(
      client.saveCorrection({ ...command, approvalId: id(103) }).pipe(
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
test("native Save recovery retains the exact intended correction when receipt reads are missing or forged", async () => {
  const result = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: command.operationId,
    status: "recorded",
    receipt,
  };
  const recover = (value, input = command) =>
    Effect.runPromise(
      client
        .recoverCorrection(input)
        .pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value))),
    );
  assert.deepEqual(await recover(result), result);
  assert.equal(
    (await recover({ ...result, status: "unresolved", receipt: null })).status,
    "unresolved",
  );
  for (const patch of [{ actorId: id(2) }, { householdId: id(20) }, { operationId: id(103) }])
    await assert.rejects(recover({ ...result, ...patch, receipt: null }), { code: "unavailable" });
  await assert.rejects(
    recover(result, { ...command, correction: payload({ sourceEventId: id(401) }) }),
    { code: "unavailable" },
  );
  await assert.rejects(recover({ ...result, receipt: { ...receipt, approvalId: id(104) } }), {
    code: "unavailable",
  });
  await assert.rejects(recover(result, { ...command, actorId: id(2) }), { code: "invalid" });
});

test("native cancellation sends only the operation and validates the exact terminal correction", async () => {
  const value = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: command.operationId,
    status: "cancelled",
    receipt: null,
  };
  const cancel = (response) =>
    Effect.runPromise(
      client.cancelCorrection(command).pipe(
        Effect.provideService(Fetch.Fetch, async (url, init) => {
          assert.equal(String(url), "http://localhost/v1/money/correction/cancel");
          assert.equal(init.method, "POST");
          assert.deepEqual(JSON.parse(init.body), { operationId: command.operationId });
          return Response.json(response);
        }),
      ),
    );
  assert.deepEqual(await cancel(value), value);
  assert.deepEqual((await cancel({ ...value, status: "recorded", receipt })).receipt, receipt);
  for (const patch of [
    { status: "unresolved" },
    { actorId: id(2) },
    {
      status: "recorded",
      receipt: { ...receipt, correction: payload({ sourceEventId: id(401) }) },
    },
  ])
    await assert.rejects(cancel({ ...value, ...patch }), { code: "unavailable" });
});
