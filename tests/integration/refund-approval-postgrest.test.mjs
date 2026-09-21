import assert from "node:assert/strict";
import { test } from "node:test";
import { refundApiFixture } from "./refund-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { id } from "../database/native-expense-helpers.mjs";
import { refund as payload } from "./refund-api-fixture.mjs";
test("real approval HTTP confirmation recovers after committed response loss and shows private durable result", async (t) => {
  const f = await refundApiFixture(t),
    operationId = id(100),
    refund = payload(f.source);
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: operationId,
    p_command: "expenses.refund",
    p_version: 1,
    p_payload: refund,
  });
  const read = (token = f.bearer, query = `approvalId=${approvalId}`) =>
    fetch(`${f.url}/v1/money/refund/approval?${query}`, {
      headers: { authorization: `Bearer ${token}`, "x-nest-household": id(10) },
    });
  assert.equal((await read(f.partnerBearer)).status, 403);
  assert.equal(
    (await read(f.bearer, `approvalId=${approvalId}&approvalId=${approvalId}`)).status,
    400,
  );
  assert.equal((await (await read()).json()).approval.status, "pending");
  const path = "/v1/money/refund/approval/decide",
    command = { operationId, approvalId, refund, approved: true };
  const proxy = await lostResponseProxy(t, f.url, path);
  await assert.rejects(f.send(path, command, f.bearer, proxy.url));
  const response = await f.send(path, command, f.bearer, proxy.url);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.approval.status, "consumed");
  assert.equal(result.approval.receipt.approvalId, approvalId);
  assert.deepEqual(await (await read()).json(), result);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
  assert.equal((await f.send(path, { ...command, approved: false })).status, 409);
  assert.equal(proxy.dropped(), 1);
});
