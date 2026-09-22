import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id } from "./renewal-fixture.mjs";

test("signed session claims fence HTTP enrollment after idempotent logout", async (t) => {
  const f = await fixture(t, [
    "supabase/migrations/20260922223732_native_push_registration.sql",
    "supabase/migrations/20260922230403_native_push_logout.sql",
  ]);
  const headers = { Authorization: `Bearer ${f.bearer}`, "Content-Type": "application/json" };
  const command = {
    operationId: id(1150),
    installationId: id(1151),
    expectedRevision: null,
    action: "register",
    token: "ExponentPushToken[LogoutHttpFixture]",
  };
  const save = () =>
    fetch(new URL("/v1/push-devices/save", f.url), {
      method: "POST",
      headers,
      body: JSON.stringify(command),
    });
  assert.equal((await save()).status, 200);
  const revoke = () =>
    fetch(new URL("/rest/v1/rpc/nest_revoke_push_session", f.supabaseUrl), {
      method: "POST",
      headers,
      body: "{}",
    });
  const response = await revoke();
  assert.equal(response.status, 200);
  const receipt = await response.json();
  const claims = JSON.parse(Buffer.from(f.bearer.split(".")[1], "base64url").toString());
  assert.deepEqual(receipt, {
    version: 1,
    actorId: id(1),
    sessionId: claims.session_id,
    revoked: true,
  });
  assert.deepEqual(await (await revoke()).json(), receipt);
  assert.equal((await save()).status, 403);
  assert.equal(
    f.db.sql("select count(*) from private.nest_push_devices where token is not null"),
    "0",
  );
  const anonymous = await fetch(new URL("/rest/v1/rpc/nest_revoke_push_session", f.supabaseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.ok([401, 403].includes(anonymous.status));
});
