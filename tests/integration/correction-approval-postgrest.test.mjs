import assert from "node:assert/strict";
import { test } from "node:test";
import { correctionApiFixture } from "./correction-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { id } from "../database/native-expense-helpers.mjs";
import { correction as payload } from "./correction-api-fixture.mjs";
test("real approval HTTP confirmation recovers after committed response loss and shows private durable result", async (t) => {
  const f = await correctionApiFixture(t),
    operationId = id(100),
    correction = payload(f.source);
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: operationId,
    p_command: "expenses.correct",
    p_version: 1,
    p_payload: correction,
  });
  const read = (token = f.bearer, query = `approvalId=${approvalId}`) =>
    fetch(`${f.url}/v1/money/correction/approval?${query}`, {
      headers: { authorization: `Bearer ${token}`, "x-nest-household": id(10) },
    });
  assert.equal((await read(f.partnerBearer)).status, 403);
  assert.equal(
    (await read(f.bearer, `approvalId=${approvalId}&approvalId=${approvalId}`)).status,
    400,
  );
  assert.equal((await (await read()).json()).approval.status, "pending");
  const path = "/v1/money/correction/approval/decide",
    command = { operationId, approvalId, correction, approved: true };
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

test("native correction denial recovers a lost acknowledgement without posting money", async (t) => {
  const { createRequire } = await import("node:module");
  const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
  const Effect = await import(require.resolve("effect/Effect")),
    Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
  const { moneyClient } = await import("../../apps/mobile/src/money/client.ts");
  const f = await correctionApiFixture(t),
    operationId = id(200),
    correction = payload(f.source);
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: operationId,
    p_command: "expenses.correct",
    p_version: 1,
    p_payload: correction,
  });
  const proxy = await lostResponseProxy(t, f.url, "/v1/money/correction/approval/decide");
  const client = moneyClient(
    proxy.url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const run = (effect) => Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
  const command = { approvalId, operationId, correction, approved: false };
  await assert.rejects(run(client.decideCorrection(command)), { code: "unavailable" });
  const recovered = await run(client.correctionApproval(approvalId));
  assert.equal(recovered.status, "denied");
  assert.equal(recovered.receipt, null);
  assert.deepEqual(await run(client.decideCorrection(command)), recovered);
  await assert.rejects(run(client.decideCorrection({ ...command, approved: true })), {
    code: "conflict",
  });
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});
