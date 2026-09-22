import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run, Effect, Fetch } from "./renewal-fixture.mjs";
import { revokePushSession } from "../../apps/mobile/src/push/logout-client.ts";

async function verifyNativeCleanup(f, receipt) {
  const config = {
    supabaseUrl: f.supabaseUrl,
    apiUrl: f.url,
    publishableKey: "sb_publishable_fixture",
  };
  const revoke = revokePushSession(config, f.bearer);
  const lost = async (input, init) => {
    const result = await fetch(input, init);
    assert.equal(result.status, 200);
    throw new Error("lost acknowledgment");
  };
  await assert.rejects(run(revoke.pipe(Effect.provideService(Fetch.Fetch, lost))));
  assert.deepEqual(await run(revoke), receipt);
  for (const value of [
    { ...receipt, actorId: id(2) },
    { ...receipt, sessionId: id(1152) },
    { ...receipt, revoked: false },
    { ...receipt, token: f.bearer },
  ]) {
    await assert.rejects(
      run(revoke.pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value)))),
    );
  }
  let requests = 0;
  const transport = async () => {
    requests++;
    return Response.json(receipt);
  };
  for (const token of ["", "malformed", "e30.e30.signature", "e30.!.signature"])
    await assert.rejects(
      run(revokePushSession(config, token).pipe(Effect.provideService(Fetch.Fetch, transport))),
    );
  assert.equal(requests, 0);
}

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
  await verifyNativeCleanup(f, receipt);
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
