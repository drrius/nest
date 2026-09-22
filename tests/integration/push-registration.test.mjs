import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id } from "./renewal-fixture.mjs";
test("authenticated push HTTP saves and recovers token-free receipts with strict request handling", async (t) => {
  const f = await fixture(t, ["supabase/migrations/20260922223732_native_push_registration.sql"]);
  const command = {
    operationId: id(980),
    installationId: id(981),
    expectedRevision: null,
    action: "register",
    token: "ExponentPushToken[HttpFixture]",
  };
  const request = (path, body, bearer = f.bearer) =>
    fetch(new URL(path, f.url), {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const saved = await request("/v1/push-devices/save", command);
  assert.equal(saved.status, 200);
  const receipt = await saved.json();
  assert.equal(JSON.stringify(receipt).includes(command.token), false);
  const recovered = await request(`/v1/push-devices/operation?operationId=${command.operationId}`);
  assert.equal(recovered.status, 200);
  assert.deepEqual((await recovered.json()).receipt, receipt);
  const state = await request(`/v1/push-devices/detail?installationId=${command.installationId}`);
  assert.equal(state.status, 200);
  assert.equal((await state.json()).enabled, true);
  const injected = await request("/v1/push-devices/save", { ...command, actorId: id(2) });
  assert.equal(injected.status, 400);
  const duplicate = await request(
    `/v1/push-devices/detail?installationId=${command.installationId}&installationId=${command.installationId}`,
  );
  assert.equal(duplicate.status, 400);
  const changed = await request("/v1/push-devices/save", { ...command, token: "different" });
  assert.equal(changed.status, 400);
  assert.equal(JSON.stringify(await changed.json()).includes(command.token), false);
  const noAuth = await fetch(
    new URL(`/v1/push-devices/detail?installationId=${command.installationId}`, f.url),
  );
  assert.equal(noAuth.status, 401);
});
