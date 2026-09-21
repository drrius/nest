import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { expenseApprovalClient } from "../src/money/approval-client.ts";
import { expenseApprovalOperations } from "../src/money/approval-operations.ts";
import { OfflineFailure } from "../src/offline/contracts.ts";
import { id, payload } from "../../../tests/database/native-expense-helpers.mjs";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const account = { actor: id(1), household: id(10) };
const credentials = Effect.succeed({ user: { id: id(1) }, access_token: "fixture" });
const client = expenseApprovalClient("http://localhost/", account, credentials);
const command = { operationId: id(100), approvalId: id(101), expense: payload(), approved: true };
const pending = {
  version: 1,
  actorId: account.actor,
  householdId: account.household,
  approval: {
    id: command.approvalId,
    operationId: command.operationId,
    expense: command.expense,
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
      expense: command.expense,
    },
  },
};
const run = (effect, value, status = 200) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value, { status }))),
  );
test("native expense approval binds private reads and exact decision receipts", async () => {
  assert.deepEqual(await run(client.approval(command.approvalId), pending), pending.approval);
  assert.deepEqual(await run(client.decideExpense(command), consumed), consumed.approval);
  const denied = { ...pending, approval: { ...pending.approval, status: "denied" } };
  assert.deepEqual(
    await run(client.decideExpense({ ...command, approved: false }), denied),
    denied.approval,
  );
  for (const value of [
    { ...pending, actorId: id(2) },
    { ...pending, householdId: id(20) },
    { ...pending, approval: { ...pending.approval, id: id(103) } },
    { ...pending, privateField: "unexpected" },
  ])
    await assert.rejects(run(client.approval(command.approvalId), value), { code: "unavailable" });
  for (const value of [
    pending,
    denied,
    {
      ...consumed,
      approval: { ...consumed.approval, receipt: { ...consumed.approval.receipt, actorId: id(2) } },
    },
  ])
    await assert.rejects(run(client.decideExpense(command), value), { code: "unavailable" });
  await assert.rejects(
    run(
      client.decideExpense({ ...command, expense: { ...command.expense, description: "Changed" } }),
      consumed,
    ),
    { code: "unavailable" },
  );
  await assert.rejects(run(client.decideExpense({ ...command, operationId: id(104) }), consumed), {
    code: "unavailable",
  });
});
test("native expense approval rejects authority injection before dispatch and maps failures", async () => {
  let calls = 0;
  for (const effect of [
    client.approval("bad"),
    client.decideExpense({ ...command, actorId: id(2) }),
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
    await assert.rejects(run(client.decideExpense(command), {}, status), { code });
});
test("native approval operations check account lease before dispatch and after response", async () => {
  let valid = false,
    calls = 0;
  const scoped = {
    session: { ...account, lease: id(200) },
    store: {
      checkSession: () =>
        Effect.suspend(() =>
          valid ? Effect.void : Effect.fail(new OfflineFailure({ reason: "session_changed" })),
        ),
    },
  };
  const remote = Effect.sync(() => {
    calls++;
    valid = false;
    return consumed.approval;
  });
  const operations = expenseApprovalOperations(scoped, {
    approval: () => remote,
    decideExpense: () => remote,
  });
  for (const effect of [operations.read(command.approvalId), operations.decide(command)])
    await assert.rejects(Effect.runPromise(effect), { reason: "session_changed" });
  assert.equal(calls, 0);
  for (const effect of [operations.read(command.approvalId), operations.decide(command)]) {
    valid = true;
    await assert.rejects(Effect.runPromise(effect), { reason: "session_changed" });
  }
  assert.equal(calls, 2);
});
test("native decisions canonicalize UUID spelling without changing expense amounts or text", async () => {
  const alpha = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const expense = {
    ...command.expense,
    payerId: alpha,
    categoryId: alpha,
    allocations: command.expense.allocations.map((value, index) => ({
      ...value,
      memberId: index === 1 ? alpha : value.memberId,
    })),
  };
  const input = {
    ...command,
    operationId: alpha.toUpperCase(),
    approvalId: alpha.toUpperCase(),
    expense: {
      ...expense,
      payerId: alpha.toUpperCase(),
      categoryId: alpha.toUpperCase(),
      allocations: expense.allocations.map((value) => ({
        ...value,
        memberId: value.memberId.toUpperCase(),
      })),
    },
  };
  const result = {
    ...consumed,
    approval: {
      ...consumed.approval,
      id: alpha,
      operationId: alpha,
      expense,
      receipt: { ...consumed.approval.receipt, operationId: alpha, approvalId: alpha, expense },
    },
  };
  let captured;
  const value = await Effect.runPromise(
    client.decideExpense(input).pipe(
      Effect.provideService(Fetch.Fetch, async (_url, options) => {
        captured = JSON.parse(options.body);
        return Response.json(result);
      }),
    ),
  );
  assert.deepEqual(value, result.approval);
  assert.deepEqual(captured, { ...command, operationId: alpha, approvalId: alpha, expense });
});
