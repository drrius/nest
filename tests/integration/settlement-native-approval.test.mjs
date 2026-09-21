import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { settlementApiFixture } from "./settlement-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { id } from "../database/native-expense-helpers.mjs";
import { settlement as payload } from "./settlement-api-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const run = (effect) => Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
const native = (url, token, actor = id(1)) =>
  moneyClient(
    url,
    { actor, household: id(10) },
    Effect.succeed({ user: { id: actor }, access_token: token }),
  );
async function propose(f, operationId) {
  return f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: operationId,
    p_command: "settlements.record",
    p_version: 1,
    p_payload: payload(),
  });
}
test("native approval client recovers actual committed response loss, then reopens canonical receipt", async (t) => {
  const f = await settlementApiFixture(t);
  const operationId = id(100),
    approvalId = await propose(f, operationId);
  const proxy = await lostResponseProxy(t, f.url, "/v1/money/settlement/approval/decide");
  const client = native(proxy.url, f.bearer);
  const approval = await run(client.settlementApproval(approvalId));
  assert.equal(approval.status, "pending");
  const command = { operationId, approvalId, settlement: approval.settlement, approved: true };
  await assert.rejects(run(client.decideSettlement(command)), { code: "unavailable" });
  const reopened = await run(native(f.url, f.bearer).settlementApproval(approvalId));
  assert.equal(reopened.status, "consumed");
  assert.deepEqual(await run(client.decideSettlement(command)), reopened);
  assert.equal(reopened.receipt.approvalId, approvalId);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
  await assert.rejects(run(native(f.url, f.partnerBearer, id(2)).settlementApproval(approvalId)), {
    code: "forbidden",
  });
  await assert.rejects(run(client.decideSettlement({ ...command, approved: false })), {
    code: "conflict",
  });
  assert.equal(proxy.dropped(), 1);
});
test("native denial survives response loss without creating a financial event", async (t) => {
  const f = await settlementApiFixture(t);
  const operationId = id(110),
    approvalId = await propose(f, operationId);
  const proxy = await lostResponseProxy(t, f.url, "/v1/money/settlement/approval/decide");
  const client = native(proxy.url, f.bearer);
  const command = { operationId, approvalId, settlement: payload(), approved: false };
  await assert.rejects(run(client.decideSettlement(command)), { code: "unavailable" });
  const result = await run(client.decideSettlement(command));
  assert.equal(result.status, "denied");
  assert.deepEqual(await run(native(f.url, f.bearer).settlementApproval(approvalId)), result);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  const partner = native(f.url, f.partnerBearer, id(2));
  await assert.rejects(run(partner.settlementApproval(approvalId)), { code: "forbidden" });
  await assert.rejects(run(partner.decideSettlement(command)), { code: "forbidden" });
});
