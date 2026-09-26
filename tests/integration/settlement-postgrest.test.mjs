import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { settlementApiFixture, settlement } from "./settlement-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url)),
  Effect = await import(require.resolve("effect/Effect")),
  Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const run = (effect) => Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
const native = (f, url = f.url) =>
  moneyClient(
    url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
test("real native partial settlement survives response loss exactly once, then full settlement uses the newly reviewed balance", async (t) => {
  const f = await settlementApiFixture(t),
    proxy = await lostResponseProxy(t, f.url, "/v1/money/settlement/save"),
    client = native(f, proxy.url);
  const command = {
    operationId: id(100),
    settlement: settlement({ mode: "partial", amountCentimes: "300" }),
  };
  await assert.rejects(run(client.saveSettlement(command)), { code: "unavailable" });
  const receipt = await run(client.saveSettlement(command));
  assert.deepEqual(receipt.settlement, command.settlement);
  assert.equal(
    f.db.sql("select count(*) from public.financial_events where type='settlement'"),
    "1",
  );
  await assert.rejects(
    run(client.saveSettlement({ operationId: id(101), settlement: settlement() })),
    { code: "conflict" },
  );
  await run(
    client.saveSettlement({
      operationId: id(102),
      settlement: settlement({ amountCentimes: "700", expectedOutstandingCentimes: "700" }),
    }),
  );
  assert.equal((await run(native(f).balance())).members[0].centimes, "0");
  assert.equal(proxy.dropped(), 1);
  const path = "/v1/money/settlement/save";
  assert.equal((await f.send(path, { ...command, actorId: id(2) })).status, 400);
  assert.equal((await f.send(path, command, f.otherBearer)).status, 403);
  assert.equal((await f.send(path + "?origin=ui", command)).status, 400);
  assert.equal((await f.send(path, command)).headers.get("cache-control"), "no-store");
});
test("approved settlement API rejects pending/missing/wrong-owner approvals and recovers a lost consumed receipt", async (t) => {
  const f = await settlementApiFixture(t),
    path = "/v1/money/settlement/execute",
    operationId = id(200),
    value = settlement();
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: operationId,
    p_command: "settlements.record",
    p_version: 1,
    p_payload: value,
  });
  const command = { operationId, settlement: value, approvalId };
  assert.equal((await f.send(path, command)).status, 409);
  assert.equal((await f.send(path, { operationId, settlement: value })).status, 400);
  await f.rpc("nest_decide_action", {
    p_id: approvalId,
    p_invocation: operationId,
    p_command: "settlements.record",
    p_version: 1,
    p_payload: value,
    p_approved: true,
  });
  assert.equal((await f.send(path, command, f.partnerBearer)).status, 403);
  const proxy = await lostResponseProxy(t, f.url, path);
  await assert.rejects(f.send(path, command, f.bearer, proxy.url));
  const response = await f.send(path, command, f.bearer, proxy.url);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).approvalId, approvalId);
  assert.equal(
    f.db.sql(`select status from public.nest_action_approvals where id='${approvalId}'`),
    "consumed",
  );
  assert.equal(
    f.db.sql("select count(*) from public.financial_events where type='settlement'"),
    "1",
  );
});
test("native and API canonicalize alphabetic settlement member and operation identities", async (t) => {
  const partner = "abcdefab-abcd-4abc-8abc-abcdefabcdef",
    operationId = "cdefabcd-abcd-4abc-8abc-abcdefabcdef";
  const f = await settlementApiFixture(t, partner);
  const value = settlement({ payerId: partner.toUpperCase() }),
    client = native(f);
  const receipt = await run(
    client.saveSettlement({ operationId: operationId.toUpperCase(), settlement: value }),
  );
  assert.equal(receipt.operationId, operationId);
  assert.equal(receipt.settlement.payerId, partner);
  assert.deepEqual(
    await run(client.saveSettlement({ operationId, settlement: { ...value, payerId: partner } })),
    receipt,
  );
});

test("stale balance and cancelled Save return non-retryable conflicts without posting", async (t) => {
  const f = await settlementApiFixture(t);
  const headers = { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" };
  const rpc = (name, body) =>
    fetch(`${f.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  const before = f.db.sql("select count(*) from public.financial_events");
  const cancelled = id(411);
  assert.equal(
    (
      await rpc("nest_cancel_settlement_save", {
        p_household: id(10),
        p_operation: cancelled,
      })
    ).status,
    200,
  );
  for (const [operation, value] of [
    [id(410), settlement({ amountCentimes: "900", expectedOutstandingCentimes: "900" })],
    [cancelled, settlement()],
  ]) {
    const response = await rpc("nest_save_settlement", {
      p_household: id(10),
      p_operation: operation,
      p_payload: value,
    });
    assert.equal(response.status, 412);
    assert.equal((await response.json()).code, "PT412");
    assert.equal(f.db.sql("select count(*) from public.financial_events"), before);
  }
});
