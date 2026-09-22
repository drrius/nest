import { pushEnrollmentActions } from "../../apps/mobile/src/push/enrollment-actions.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pushDeviceClient } from "../../apps/mobile/src/push/client.ts";
import { protectedPushAttempts } from "../../apps/mobile/src/push/protected-attempt.ts";
import { pushEnrollmentOperations } from "../../apps/mobile/src/push/operations.ts";
import { fixture, id, Effect, Fetch, run } from "./renewal-fixture.mjs";
test("enrollment stages before HTTP and reconstruction recovers a lost commit without posting again", async (t) => {
  const f = await fixture(t, ["supabase/migrations/20260922223732_native_push_registration.sql"]);
  const account = { actor: id(1), household: id(10) };
  const command = {
    operationId: id(995),
    installationId: id(996),
    expectedRevision: null,
    action: "register",
    token: "ExponentPushToken[RecoveryFixture]",
  };
  const values = new Map();
  const disk = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
  const client = pushDeviceClient(
    f.url,
    account,
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    (input) => Effect.sync(() => createHash("sha256").update(input).digest("hex")),
  );
  let active = true,
    posts = 0;
  const make = (storage = disk) =>
    pushEnrollmentOperations({
      account,
      client,
      store: protectedPushAttempts(storage),
      current: () => active,
    });
  const lost = async (input, init) => {
    if (init?.method === "POST") {
      posts++;
      assert.equal(values.size, 1, "protected staging precedes network dispatch");
    }
    const response = await fetch(input, init);
    assert.equal(response.status, 200);
    throw new TypeError("lost commit acknowledgment");
  };
  await assert.rejects(run(make().save(command).pipe(Effect.provideService(Fetch.Fetch, lost))));
  assert.equal(posts, 1);
  assert.equal(values.size, 1);
  const recovered = await run(make().recover());
  assert.equal(recovered.status, "recorded");
  assert.equal(values.size, 0);
  assert.equal(f.db.sql("select count(*) from private.nest_push_device_operations"), "1");
  const neverSend = () => {
    posts++;
    throw new Error("unexpected dispatch");
  };
  const failure = {
    ...disk,
    setItem: async () => {
      throw new Error("locked store");
    },
  };
  await assert.rejects(
    run(
      make(failure)
        .save({ ...command, operationId: id(997) })
        .pipe(Effect.provideService(Fetch.Fetch, neverSend)),
    ),
  );
  assert.equal(posts, 1);
  await verifyExplicitActions({ command, recovered, client, operations: make(), values, disk });
  active = false;
  await assert.rejects(
    run(make().save(command).pipe(Effect.provideService(Fetch.Fetch, neverSend))),
  );
  assert.equal(posts, 1);
});

async function verifyExplicitActions({ command, recovered, client, operations, values, disk }) {
  let operation = 998;
  const actions = pushEnrollmentActions({
    current: () => true,
    installation: Effect.succeed(command.installationId),
    token: Effect.succeed("ExponentPushToken[ExplicitActionFixture]"),
    operationId: () => id(operation++),
    client,
    operations,
  });
  const enabled = await run(actions.enable());
  assert.equal(enabled.expectedRevision, recovered.receipt.revision);
  assert.equal((await run(client.detail(command.installationId))).enabled, true);
  const disabled = await run(actions.disable());
  assert.equal(disabled.expectedRevision, enabled.revision);
  assert.equal((await run(client.detail(command.installationId))).enabled, false);
  assert.equal(values.size, 0);
  const pending = { ...command, operationId: id(1001), expectedRevision: disabled.revision };
  await protectedPushAttempts(disk).stage({ actor: id(1), household: id(10) }, pending);
  const retried = await run(operations.retryPending());
  assert.equal(retried.operationId, pending.operationId);
  assert.equal(retried.expectedRevision, disabled.revision);
  assert.equal(values.size, 0);
  assert.equal(await run(operations.retryPending()), null);
}
