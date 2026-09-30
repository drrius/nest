import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { refundApprovalClient } from "../src/money/refund-approval-client.ts";
import { id } from "../../../tests/database/native-expense-helpers.mjs";
import { refund as payload } from "../../../tests/integration/refund-api-fixture.mjs";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const account = { actor: id(1), household: id(10) };
const credentials = Effect.succeed({ user: { id: id(1) }, access_token: "fixture" });
const client = refundApprovalClient("http://localhost/", account, credentials);
const command = {
  operationId: id(100),
  approvalId: id(101),
  refund: payload(id(400)),
  approved: true,
};
const pending = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  approval: {
    id: command.approvalId,
    operationId: command.operationId,
    refund: command.refund,
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
      refund: command.refund,
    },
  },
};
const run = (effect, value, status = 200) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value, { status }))),
  );
test("native refund approval binds private reads and exact decision receipts", async () => {
  assert.deepEqual(await run(client.refundApproval(command.approvalId), pending), pending.approval);
  assert.deepEqual(await run(client.decideRefund(command), consumed), consumed.approval);
  const denied = { ...pending, approval: { ...pending.approval, status: "denied" } };
  assert.deepEqual(
    await run(client.decideRefund({ ...command, approved: false }), denied),
    denied.approval,
  );
  for (const value of [
    { ...pending, actorId: id(2) },
    { ...pending, householdId: id(20) },
    { ...pending, approval: { ...pending.approval, id: id(103) } },
    { ...pending, privateField: "unexpected" },
  ])
    await assert.rejects(run(client.refundApproval(command.approvalId), value), {
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
    await assert.rejects(run(client.decideRefund(command), value), { code: "unavailable" });
  await assert.rejects(
    run(
      client.decideRefund({
        ...command,
        refund: { ...command.refund, description: "Changed" },
      }),
      consumed,
    ),
    { code: "unavailable" },
  );
  await assert.rejects(run(client.decideRefund({ ...command, operationId: id(104) }), consumed), {
    code: "unavailable",
  });
});
test("native refund approval rejects authority injection before dispatch and maps failures", async () => {
  let calls = 0;
  for (const effect of [
    client.refundApproval("bad"),
    client.decideRefund({ ...command, actorId: id(2) }),
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
    await assert.rejects(run(client.decideRefund(command), {}, status), { code });
});
test("native decisions canonicalize UUID spelling without changing refund amounts or text", async () => {
  const alpha = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const refund = {
    ...command.refund,
    payerId: alpha,
    sourceEventId: alpha,
    allocations: command.refund.allocations.map((share) => ({
      ...share,
      memberId: share.memberId === id(2) ? alpha : share.memberId,
    })),
    expectedRemaining: command.refund.expectedRemaining.map((share) => ({
      ...share,
      memberId: share.memberId === id(2) ? alpha : share.memberId,
    })),
  };
  const input = {
    ...command,
    operationId: alpha.toUpperCase(),
    approvalId: alpha.toUpperCase(),
    refund: {
      ...refund,
      payerId: alpha.toUpperCase(),
      sourceEventId: alpha.toUpperCase(),
      allocations: refund.allocations.map((share) => ({
        ...share,
        memberId: share.memberId.toUpperCase(),
      })),
      expectedRemaining: refund.expectedRemaining.map((share) => ({
        ...share,
        memberId: share.memberId.toUpperCase(),
      })),
    },
  };
  const result = {
    ...consumed,
    approval: {
      ...consumed.approval,
      id: alpha,
      operationId: alpha,
      refund,
      receipt: { ...consumed.approval.receipt, operationId: alpha, approvalId: alpha, refund },
    },
  };
  let captured;
  const value = await Effect.runPromise(
    client.decideRefund(input).pipe(
      Effect.provideService(Fetch.Fetch, async (_url, options) => {
        captured = JSON.parse(options.body);
        return Response.json(result);
      }),
    ),
  );
  assert.deepEqual(value, result.approval);
  assert.deepEqual(captured, { ...command, operationId: alpha, approvalId: alpha, refund });
});
