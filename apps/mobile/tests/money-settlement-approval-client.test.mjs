import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { settlementApprovalClient } from "../src/money/settlement-approval-client.ts";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
import { settlement as payload } from "../../../tests/integration/settlement-api-fixture.mjs";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const account = { actor: id(1), household: id(10) };
const credentials = Effect.succeed({ user: { id: id(1) }, access_token: "fixture" });
const client = settlementApprovalClient("http://localhost/", account, credentials);
const command = {
  operationId: id(100),
  approvalId: id(101),
  settlement: payload(),
  approved: true,
};
const pending = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  approval: {
    id: command.approvalId,
    operationId: command.operationId,
    settlement: command.settlement,
    expiresAt: "2026-09-21T12:00:00.000000Z",
    status: "pending",
    receipt: null,
  },
};
const consumed = {
  ...pending,
  approval: {
    ...pending.approval,
    status: "consumed",
    receipt: {
      version: 1,
      actorId: account.actor,
      householdId: account.household,
      operationId: command.operationId,
      approvalId: command.approvalId,
      eventId: id(102),
      settlement: command.settlement,
    },
  },
};
const run = (effect, value, status = 200) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value, { status }))),
  );
test("native settlement approval binds private reads and exact decision receipts", async () => {
  assert.deepEqual(
    await run(client.settlementApproval(command.approvalId), pending),
    pending.approval,
  );
  assert.deepEqual(await run(client.decideSettlement(command), consumed), consumed.approval);
  const denied = { ...pending, approval: { ...pending.approval, status: "denied" } };
  assert.deepEqual(
    await run(client.decideSettlement({ ...command, approved: false }), denied),
    denied.approval,
  );
  for (const value of [
    { ...pending, actorId: id(2) },
    { ...pending, householdId: id(20) },
    { ...pending, approval: { ...pending.approval, id: id(103) } },
    { ...pending, privateField: "unexpected" },
  ])
    await assert.rejects(run(client.settlementApproval(command.approvalId), value), {
      code: "unavailable",
    });
  for (const value of [
    pending,
    denied,
    {
      ...consumed,
      approval: { ...consumed.approval, receipt: { ...consumed.approval.receipt, actorId: id(2) } },
    },
  ])
    await assert.rejects(run(client.decideSettlement(command), value), { code: "unavailable" });
  await assert.rejects(
    run(
      client.decideSettlement({
        ...command,
        settlement: { ...command.settlement, description: "Changed" },
      }),
      consumed,
    ),
    { code: "unavailable" },
  );
  await assert.rejects(
    run(client.decideSettlement({ ...command, operationId: id(104) }), consumed),
    {
      code: "unavailable",
    },
  );
});
test("native settlement approval rejects authority injection before dispatch and maps failures", async () => {
  let calls = 0;
  for (const effect of [
    client.settlementApproval("bad"),
    client.decideSettlement({ ...command, actorId: id(2) }),
  ])
    await assert.rejects(
      Effect.runPromise(
        effect.pipe(
          Effect.provideService(Fetch.Fetch, async () => {
            calls++;
            return Response.json(consumed);
          }),
        ),
      ),
      { code: "invalid" },
    );
  assert.equal(calls, 0);
  for (const [status, code] of [
    [401, "session"],
    [403, "forbidden"],
    [409, "conflict"],
    [503, "unavailable"],
  ])
    await assert.rejects(run(client.decideSettlement(command), {}, status), { code });
});
test("native decisions canonicalize UUID spelling without changing settlement amounts or text", async () => {
  const alpha = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const settlement = {
    ...command.settlement,
    payerId: alpha,
  };
  const input = {
    ...command,
    operationId: alpha.toUpperCase(),
    approvalId: alpha.toUpperCase(),
    settlement: {
      ...settlement,
      payerId: alpha.toUpperCase(),
    },
  };
  const result = {
    ...consumed,
    approval: {
      ...consumed.approval,
      id: alpha,
      operationId: alpha,
      settlement,
      receipt: { ...consumed.approval.receipt, operationId: alpha, approvalId: alpha, settlement },
    },
  };
  let captured;
  const value = await Effect.runPromise(
    client.decideSettlement(input).pipe(
      Effect.provideService(Fetch.Fetch, async (_url, options) => {
        captured = JSON.parse(options.body);
        return Response.json(result);
      }),
    ),
  );
  assert.deepEqual(value, result.approval);
  assert.deepEqual(captured, { ...command, operationId: alpha, approvalId: alpha, settlement });
});
