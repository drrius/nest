import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { pushWorkerFixture } from "./push-worker-fixture.mjs";
import { id, migration } from "../database/apns-registration-fixture.mjs";
import { pushDeviceDigestInput } from "../../packages/contracts/src/push-registration.ts";
async function fixture(t) {
  const f = await pushWorkerFixture(t);
  f.db.file(migration);
  f.db.file("tests/integration/food-postgrest.sql");
  f.db.sql("notify pgrst,'reload schema'");
  const server = nodeServer(createHandler(f.config));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, bearer = f.http.bearer) => {
    const response = await fetch(new URL(path, base), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "x-nest-household": id(10),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const command = {
    action: "register",
    provider: "apns",
    environment: "sandbox",
    token: "a1b2c3",
    operationId: id(2900),
    installationId: id(2901),
    expectedRevision: null,
  };
  return { ...f, request, command };
}
test("authorized APNs HTTP enrollment retains exact token-free environment-bound receipts", async (t) => {
  const f = await fixture(t),
    command = f.command;
  const saved = await f.request("/v1/push-devices/save", command);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(
    saved.body.commandDigest,
    createHash("sha256")
      .update(pushDeviceDigestInput(command, id(1), id(10)))
      .digest("hex"),
  );
  assert.equal(JSON.stringify(saved).includes(command.token), false);
  assert.deepEqual(await f.request("/v1/push-devices/save", command), saved);
  const recovered = await f.request(
    `/v1/push-devices/operation?operationId=${command.operationId}`,
  );
  assert.equal(recovered.status, 200);
  assert.deepEqual(recovered.body.receipt, saved.body);
  const path = `/v1/push-devices/detail?installationId=${command.installationId}`;
  const detail = await f.request(path);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.provider, "apns");
  assert.equal(detail.body.environment, "sandbox");
  assert.equal(detail.body.enabled, true);
  assert.equal(JSON.stringify(detail).includes(command.token), false);
  const partner = await f.request(path, undefined, f.http.partnerBearer);
  assert.equal(partner.status, 200);
  assert.equal(partner.body.revision, null);
  assert.equal(partner.body.provider, undefined);
  assert.equal((await f.request(path, undefined, f.http.otherBearer)).status, 403);
  assert.equal((await f.request("/v1/push-devices/save", command, f.http.otherBearer)).status, 403);
  assert.equal((await f.request(path, undefined, "invalid")).status, 401);
});
test("APNs HTTP conflicts never change enrollment and cancellation prevents a delayed send", async (t) => {
  const f = await fixture(t),
    command = f.command;
  const saved = await f.request("/v1/push-devices/save", command);
  assert.equal(saved.status, 200);
  const changed = await f.request("/v1/push-devices/save", {
    ...command,
    environment: "production",
  });
  assert.equal(changed.status, 400);
  const stale = await f.request("/v1/push-devices/save", { ...command, operationId: id(2902) });
  assert.equal(stale.status, 409);
  for (const patch of [
    { environment: null },
    { token: "AABB" },
    { provider: "expo" },
    { actorId: id(2) },
  ])
    assert.equal((await f.request("/v1/push-devices/save", { ...command, ...patch })).status, 400);
  const cancel = await f.request("/v1/push-devices/cancel", { operationId: id(2903) });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.status, "cancelled");
  const delayed = await f.request("/v1/push-devices/save", {
    ...command,
    operationId: id(2903),
    expectedRevision: saved.body.revision,
    token: "aabbcc",
  });
  assert.equal(delayed.status, 409);
  const detail = await f.request(
    `/v1/push-devices/detail?installationId=${command.installationId}`,
  );
  assert.equal(detail.body.revision, saved.body.revision);
  assert.equal(detail.body.environment, "sandbox");
});
