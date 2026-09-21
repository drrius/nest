import assert from "node:assert/strict";
import { test } from "node:test";
import { expenseApiFixture } from "./expense-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { id, payload } from "../database/native-expense-helpers.mjs";
test("actual expense HTTP response loss retries one ledger transaction; API rejects injected identity and outsider", async (t) => {
  const f = await expenseApiFixture(t);
  const path = "/v1/money/expense/save";
  const proxy = await lostResponseProxy(t, f.url, path);
  const command = {
    operationId: id(100),
    expense: payload({ description: "😀".repeat(200), note: "😀".repeat(4000) }),
  };
  await assert.rejects(f.send(path, command, f.bearer, proxy.url));
  const response = await f.send(path, command, f.bearer, proxy.url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const receipt = await response.json();
  assert.deepEqual(receipt.expense, command.expense);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_expense_receipts"), "1");
  assert.equal(proxy.dropped(), 1);
  assert.equal((await f.send(path, command, f.otherBearer)).status, 403);
  assert.equal((await f.send(path, { ...command, actorId: id(2) })).status, 400);
  assert.equal((await f.send(path + "?origin=ui", command)).status, 400);
  assert.equal((await f.send(path, { ...command, expense: payload() })).status, 400);
  const balance = await fetch(`${f.url}/v1/money/balance`, {
    headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
  });
  assert.equal(balance.status, 200);
  assert.equal(
    (await balance.json()).members.find((member) => member.actorId === id(1)).centimes,
    "50",
  );
});
test("actual approved HTTP execution consumes once and rejects pending, missing and wrong-member approval", async (t) => {
  const f = await expenseApiFixture(t),
    path = "/v1/money/expense/execute";
  const expense = payload(),
    operationId = id(200);
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: operationId,
    p_command: "expenses.record",
    p_version: 1,
    p_payload: expense,
  });
  const command = { operationId, expense, approvalId };
  assert.equal((await f.send(path, command)).status, 409);
  assert.equal((await f.send(path, { operationId, expense })).status, 400);
  await f.rpc("nest_decide_action", {
    p_id: approvalId,
    p_invocation: operationId,
    p_command: "expenses.record",
    p_version: 1,
    p_payload: expense,
    p_approved: true,
  });
  assert.equal((await f.send(path, command, f.partnerBearer)).status, 403);
  const proxy = await lostResponseProxy(t, f.url, path);
  await assert.rejects(f.send(path, command, f.bearer, proxy.url));
  const response = await f.send(path, command, f.bearer, proxy.url);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).approvalId, approvalId);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approvalId}'`),
    "consumed",
  );
});
