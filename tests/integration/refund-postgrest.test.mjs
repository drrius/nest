import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { refundApiFixture, refund } from "./refund-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { id } from "../database/native-expense-helpers.mjs";
import { moneyTools } from "../../apps/api/src/money/tools.ts";
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
test("native refund lost response replays once and changed shares require a fresh review", async (t) => {
  const f = await refundApiFixture(t),
    path = "/v1/money/refund/save";
  const proxy = await lostResponseProxy(t, f.url, path),
    client = native(f, proxy.url);
  const before = await run(client.refundContext(f.source));
  const command = { operationId: id(100), refund: refund(f.source.toUpperCase()) };
  await assert.rejects(run(client.saveRefund(command)), { code: "unavailable" });
  const receipt = await run(client.saveRefund(command));
  assert.equal(receipt.refund.sourceEventId, f.source);
  assert.equal(f.db.sql("select count(*) from public.financial_events where type='refund'"), "1");
  await assert.rejects(run(client.saveRefund({ ...command, operationId: id(101) })), {
    code: "conflict",
  });
  const current = await run(client.refundContext(f.source));
  assert.deepEqual(current.source, before.source);
  assert.deepEqual(
    current.remaining.map((share) => share.centimes),
    ["300", "400"],
  );
  await run(
    client.saveRefund({
      operationId: id(102),
      refund: refund(f.source, {
        amountCentimes: "700",
        allocations: current.remaining,
        expectedRemaining: current.remaining,
      }),
    }),
  );
  assert.equal((await run(client.refundContext(f.source))).refundable, false);
  assert.equal(proxy.dropped(), 1);
  assert.equal((await f.send(path, { ...command, actorId: id(2) })).status, 400);
  assert.equal((await f.send(path, command, f.otherBearer)).status, 403);
  assert.equal((await f.send(path + "?origin=ui", command)).status, 400);
  assert.equal((await f.send(path, command)).headers.get("cache-control"), "no-store");
});
test("refund context is authorized, strict, current and read-only through native and AI", async (t) => {
  const f = await refundApiFixture(t),
    client = native(f);
  const headers = { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) };
  const context = await run(client.refundContext(f.source));
  const tools = moneyTools(new Request(f.url, { headers }), {
    url: f.supabaseUrl,
    publishableKey: "sb_publishable_fixture",
  });
  assert.deepEqual(
    await tools.readRefundContext.execute(
      { sourceEventId: f.source },
      { toolCallId: "refund-read", messages: [] },
    ),
    { ok: true, value: context },
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  for (const query of [
    "",
    "?sourceEventId=bad",
    `?sourceEventId=${f.source}&sourceEventId=${f.source}`,
    `?sourceEventId=${f.source}&householdId=${id(10)}`,
  ])
    assert.equal(
      (await fetch(f.url + "/v1/money/refund/context" + query, { headers })).status,
      400,
    );
  assert.equal(
    (
      await fetch(f.url + `/v1/money/refund/context?sourceEventId=${f.source}`, {
        headers: { ...headers, authorization: `Bearer ${f.otherBearer}` },
      })
    ).status,
    403,
  );
  for (const value of [
    { ...context, householdId: id(20), source: { ...context.source, householdId: id(20) } },
    {
      ...context,
      source: { ...context.source, event: { ...context.source.event, eventId: id(999) } },
    },
    { ...context, refundable: false },
  ])
    await assert.rejects(
      Effect.runPromise(
        client
          .refundContext(f.source)
          .pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value))),
      ),
      { code: "unavailable" },
    );
});
test("approved refund API rejects pending/missing/wrong-owner approvals and recovers a lost consumed receipt", async (t) => {
  const f = await refundApiFixture(t),
    path = "/v1/money/refund/execute",
    operationId = id(200),
    value = refund(f.source);
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: operationId,
    p_command: "expenses.refund",
    p_version: 1,
    p_payload: value,
  });
  const command = { operationId, refund: value, approvalId };
  assert.equal((await f.send(path, command)).status, 409);
  assert.equal((await f.send(path, { operationId, refund: value })).status, 400);
  await f.rpc("nest_decide_action", {
    p_id: approvalId,
    p_invocation: operationId,
    p_command: "expenses.refund",
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
  assert.equal(f.db.sql("select count(*) from public.financial_events where type='refund'"), "1");
});
