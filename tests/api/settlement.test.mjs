import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { settlementCommands } from "../../apps/api/src/money/settlement.ts";
import { id } from "../database/native-expense-helpers.mjs";
import { settlement as payload } from "../integration/settlement-api-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "A" },
  token: "fixture",
};
const command = { operationId: id(100), settlement: payload() };
const good = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  eventId: id(101),
  approvalId: null,
  settlement: payload(),
};
const run = (value, input = command, action = "save") =>
  Effect.runPromise(
    settlementCommands(config, caller)
      [action](input)
      .pipe(Effect.provideService(FetchHttpClient.Fetch, async () => Response.json(value))),
  );
test("settlement service binds full receipt and rejects hidden authorization fields", async () => {
  assert.deepEqual(await run(good), good);
  for (const input of [
    { ...command, actorId: id(2) },
    { ...command, approvalId: id(200) },
    { ...command, origin: "ui" },
  ])
    await assert.rejects(run(good, input), { code: "invalid_request" });
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(200) },
    { approvalId: id(200) },
    { settlement: payload({ note: "Altered" }) },
  ])
    await assert.rejects(run({ ...good, ...patch }), { code: "unavailable" });
  await assert.rejects(run(good, command, "execute"), { code: "invalid_request" });
});
test("approved service calls only approval-required RPC and matches normalized approval identity", async () => {
  const approval = "a0000000-0000-4000-8000-000000000001";
  const receipt = { ...good, approvalId: approval };
  const input = { ...command, approvalId: approval.toUpperCase() };
  const result = await Effect.runPromise(
    settlementCommands(config, caller)
      .execute(input)
      .pipe(
        Effect.provideService(FetchHttpClient.Fetch, async (url, init) => {
          assert.equal(new URL(url).pathname, "/rest/v1/rpc/nest_execute_settlement");
          assert.deepEqual(JSON.parse(init.body), {
            p_household: id(10),
            p_operation: id(100),
            p_payload: payload(),
            p_approval: approval,
          });
          return Response.json(receipt);
        }),
      ),
  );
  assert.deepEqual(result, receipt);
  await assert.rejects(run({ ...receipt, approvalId: id(300) }, input, "execute"), {
    code: "unavailable",
  });
});
