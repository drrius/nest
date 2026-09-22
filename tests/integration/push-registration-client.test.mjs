import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pushDeviceClient } from "../../apps/mobile/src/push/client.ts";
import { fixture, id, Effect, Fetch, run } from "./renewal-fixture.mjs";
test("native registration recovers lost acknowledgment and rejects forged receipt context", async (t) => {
  const f = await fixture(t, [
    "supabase/migrations/20260922223732_native_push_registration.sql",
    "supabase/migrations/20260922230403_native_push_logout.sql",
  ]);
  const command = {
    operationId: id(990),
    installationId: id(991),
    expectedRevision: null,
    action: "register",
    token: "ExponentPushToken[NativeFixture]",
  };
  const credentials = { user: { id: id(1) }, access_token: f.bearer };
  const client = pushDeviceClient(
    f.url,
    { actor: id(1), household: id(10) },
    Effect.sync(() => credentials),
    (input) => Effect.sync(() => createHash("sha256").update(input).digest("hex")),
  );
  const lost = async (input, init) => {
    const response = await fetch(input, init);
    assert.equal(response.status, 200);
    throw new TypeError("lost acknowledgment");
  };
  await assert.rejects(run(client.save(command).pipe(Effect.provideService(Fetch.Fetch, lost))));
  const recovered = await run(client.recover(command));
  assert.equal(recovered.status, "recorded");
  const receipt = recovered.receipt;
  assert.deepEqual(await run(client.save(command)), receipt);
  for (const forged of [
    { ...receipt, actorId: id(2) },
    { ...receipt, householdId: id(20) },
    { ...receipt, operationId: id(992) },
    { ...receipt, installationId: id(992) },
    { ...receipt, commandDigest: "0".repeat(64) },
    { ...receipt, action: "disable" },
  ]) {
    const transport = () => Promise.resolve(Response.json(forged));
    await assert.rejects(
      run(client.save(command).pipe(Effect.provideService(Fetch.Fetch, transport))),
    );
    const recoveryTransport = () =>
      Promise.resolve(Response.json({ ...recovered, receipt: forged }));
    await assert.rejects(
      run(client.recover(command).pipe(Effect.provideService(Fetch.Fetch, recoveryTransport))),
    );
  }
  credentials.user.id = id(2);
  let sends = 0;
  const transport = () => {
    sends++;
    return Promise.resolve(Response.json(receipt));
  };
  await assert.rejects(
    run(client.save(command).pipe(Effect.provideService(Fetch.Fetch, transport))),
  );
  assert.equal(sends, 0, "changed credential account stops dispatch");
  assert.equal(f.db.sql("select count(*) from private.nest_push_device_operations"), "1");
});
