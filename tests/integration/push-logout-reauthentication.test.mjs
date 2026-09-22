import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run, Effect, Fetch } from "./renewal-fixture.mjs";
import { revokePreviousPushSession } from "../../apps/mobile/src/push/logout-client.ts";

test("native fresh authentication revokes the retained old session and rejects another account", async (t) => {
  const f = await fixture(t, [
    "supabase/migrations/20260922223732_native_push_registration.sql",
    "supabase/migrations/20260922230403_native_push_logout.sql",
    "supabase/migrations/20260922232801_native_push_reauthentication_logout.sql",
  ]);
  const config = {
    supabaseUrl: f.supabaseUrl,
    apiUrl: f.url,
    publishableKey: "sb_publishable_fixture",
  };
  const command = {
    operationId: id(1250),
    installationId: id(1251),
    expectedRevision: null,
    action: "register",
    token: "ExponentPushToken[ReauthenticationHttpFixture]",
  };
  const save = (value, bearer = f.bearer) =>
    fetch(new URL("/v1/push-devices/save", f.url), {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
  assert.equal((await save(command)).status, 200);
  const cleanup = revokePreviousPushSession(config, f.freshBearer, f.bearer);
  await assert.rejects(
    run(
      cleanup.pipe(
        Effect.provideService(Fetch.Fetch, async (input, init) => {
          assert.equal((await fetch(input, init)).status, 200);
          throw new Error("lost acknowledgment");
        }),
      ),
    ),
  );
  const receipt = await run(cleanup);
  const old = JSON.parse(Buffer.from(f.bearer.split(".")[1], "base64url").toString());
  assert.deepEqual(receipt, {
    version: 1,
    actorId: id(1),
    sessionId: old.session_id,
    revoked: true,
  });
  assert.equal((await save(command)).status, 403);
  assert.equal(f.db.sql("select token is null from private.nest_push_devices"), "t");
  const fresh = {
    ...command,
    operationId: id(1252),
    expectedRevision: f.db.sql("select revision from private.nest_push_devices"),
  };
  assert.equal((await save(fresh, f.freshBearer)).status, 200);
  let sends = 0;
  await assert.rejects(
    run(
      revokePreviousPushSession(config, f.otherBearer, f.bearer).pipe(
        Effect.provideService(Fetch.Fetch, async () => {
          sends++;
          return Response.json(receipt);
        }),
      ),
    ),
  );
  assert.equal(sends, 0);
  const current = JSON.parse(Buffer.from(f.freshBearer.split(".")[1], "base64url").toString());
  await assert.rejects(
    run(
      cleanup.pipe(
        Effect.provideService(Fetch.Fetch, async () =>
          Response.json({ ...receipt, sessionId: current.session_id }),
        ),
      ),
    ),
  );
  await run(cleanup);
  assert.equal(f.db.sql("select token is not null from private.nest_push_devices"), "t");
});
