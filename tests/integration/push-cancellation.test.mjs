import { rotatePushDevice } from "../../apps/mobile/src/push/rotation.ts";
import { pushRotationCheckpoint } from "../../apps/mobile/src/push/rotation-checkpoint.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pushDeviceClient } from "../../apps/mobile/src/push/client.ts";
import { protectedPushAttempts } from "../../apps/mobile/src/push/protected-attempt.ts";
import { pushEnrollmentOperations } from "../../apps/mobile/src/push/operations.ts";
import { fixture, id, Effect, Fetch, run } from "./renewal-fixture.mjs";
async function setup(t) {
  const f = await fixture(t, [
    "supabase/migrations/20260922223732_native_push_registration.sql",
    "supabase/migrations/20260922230403_native_push_logout.sql",
    "supabase/migrations/20260922235848_native_push_cancellation.sql",
  ]);
  const account = { actor: id(1), household: id(10) },
    values = new Map();
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
  const checkpoint = () =>
    pushRotationCheckpoint({
      account,
      disk,
      hash: (token) => Effect.sync(() => createHash("sha256").update(token).digest("hex")),
    });
  const make = () => {
    const store = protectedPushAttempts(disk);
    return {
      store,
      operations: pushEnrollmentOperations({
        account,
        client,
        store,
        current: () => true,
        onCancelled: checkpoint().cancelled,
        onRecorded: checkpoint().record,
      }),
    };
  };
  const command = (op) => ({
    action: "register",
    operationId: id(op),
    installationId: id(1600),
    expectedRevision: null,
    token: "ExponentPushToken[CancelFixture]",
  });
  return {
    ...f,
    account,
    client,
    make,
    command,
    values,
    checkpoint: () =>
      pushRotationCheckpoint({
        account,
        disk,
        hash: (token) => Effect.sync(() => createHash("sha256").update(token).digest("hex")),
      }),
  };
}
test("lost cancellation response recovers on restart and rejects late enrollment over HTTP", async (t) => {
  const f = await setup(t),
    initial = f.make(),
    command = f.command(1601);
  await initial.store.stage(f.account, command);
  let posts = 0;
  const lost = async (input, init) => {
    if (init?.method === "POST") {
      posts++;
      assert.equal(await initial.store.cancelling(f.account), true);
    }
    const response = await fetch(input, init);
    assert.equal(response.status, 200);
    throw new TypeError("lost response");
  };
  await assert.rejects(
    run(initial.operations.cancelPending().pipe(Effect.provideService(Fetch.Fetch, lost))),
  );
  assert.equal(posts, 1);
  assert.equal(f.values.size, 1);
  const restarted = f.make();
  const result = await run(restarted.operations.recover());
  assert.equal(result.status, "cancelled");
  assert.equal(result.receipt, null);
  assert.equal(await f.make().store.read(f.account), null);
  await assert.rejects(run(f.client.save(command)));
  assert.equal(f.db.sql("select count(*) from private.nest_push_devices"), "0");
  assert.equal(posts, 1);
});
test("cancellation recovers already committed receipt and rejects substituted command intent", async (t) => {
  const f = await setup(t),
    command = f.command(1610);
  const receipt = await run(f.client.save(command));
  const { store, operations } = f.make();
  await store.stage(f.account, command);
  const result = await run(operations.cancelPending());
  assert.equal(result.status, "recorded");
  assert.deepEqual(result.receipt, receipt);
  assert.equal((await run(f.client.detail(command.installationId))).enabled, true);
  assert.equal(await f.make().store.read(f.account), null);
  await assert.rejects(run(f.client.cancel({ ...command, token: "different" })));
  assert.equal(f.db.sql("select count(*) from private.nest_push_cancelled_operations"), "0");
});

test("rotation cannot re-enable a registration disabled while acquiring its token", async (t) => {
  const f = await setup(t),
    command = f.command(1620);
  const receipt = await run(f.client.save(command));
  const { store, operations } = f.make();
  const rotation = rotatePushDevice({
    checkpoint: { matches: () => Effect.succeed(false), record: () => Effect.void },
    current: () => true,
    readInstallation: Effect.succeed(command.installationId),
    client: f.client,
    operations,
    operationId: () => id(1622),
    token: Effect.gen(function* () {
      yield* f.client.save({
        action: "disable",
        operationId: id(1621),
        installationId: command.installationId,
        expectedRevision: receipt.revision,
      });
      return "ExponentPushToken[RotatedFixture]";
    }),
  });
  await assert.rejects(run(rotation));
  assert.equal((await run(f.client.detail(command.installationId))).enabled, false);
  assert.equal((await store.read(f.account)).expectedRevision, receipt.revision);
  await run(operations.cancelPending());
  assert.equal(await store.read(f.account), null);
  assert.equal((await run(f.client.detail(command.installationId))).enabled, false);
});

test("cold-start token reconciliation skips a matching checkpoint and preserves disabled choice", async (t) => {
  const f = await setup(t),
    command = f.command(1630);
  await run(f.client.save(command));
  let operation = 1631,
    tokens = 0;
  const reconcile = () =>
    rotatePushDevice({
      current: () => true,
      checkpoint: f.checkpoint(),
      readInstallation: Effect.succeed(command.installationId),
      client: f.client,
      operations: f.make().operations,
      operationId: () => id(operation++),
      token: Effect.sync(() => {
        tokens++;
        return "ExponentPushToken[ColdStartFixture]";
      }),
    });
  assert.equal(await run(reconcile()), "rotated");
  assert.equal(await run(reconcile()), "unchanged");
  assert.equal(f.db.sql("select count(*) from private.nest_push_device_operations"), "2");
  const state = await run(f.client.detail(command.installationId));
  await run(
    f.client.save({
      action: "disable",
      installationId: command.installationId,
      operationId: id(1635),
      expectedRevision: state.revision,
    }),
  );
  assert.equal(await run(reconcile()), "inactive");
  assert.equal(tokens, 2);
  assert.equal((await run(f.client.detail(command.installationId))).enabled, false);
});
test("cancelled rotation remains suppressed across foreground and checkpoint reconstruction", async (t) => {
  const f = await setup(t),
    original = f.command(1640);
  const receipt = await run(f.client.save(original));
  const pending = {
    ...original,
    operationId: id(1641),
    expectedRevision: receipt.revision,
    token: "ExponentPushToken[CancelledRotation]",
  };
  const { store, operations } = f.make();
  await store.stage(f.account, pending);
  await run(operations.cancelPending());
  const reconcile = () =>
    rotatePushDevice({
      current: () => true,
      checkpoint: f.checkpoint(),
      client: f.client,
      operations: f.make().operations,
      operationId: () => id(1642),
      readInstallation: Effect.succeed(original.installationId),
      token: Effect.succeed(pending.token),
    });
  assert.equal(await run(reconcile()), "unchanged");
  assert.equal(await run(reconcile()), "unchanged");
  assert.equal(await store.read(f.account), null);
  assert.equal(f.db.sql("select count(*) from private.nest_push_device_operations"), "1");
  assert.equal(f.db.sql("select token from private.nest_push_devices"), original.token);
});
test("cancellation after the initial token check is rechecked inside protected staging", async (t) => {
  const f = await setup(t),
    original = f.command(1650);
  const receipt = await run(f.client.save(original));
  const pending = {
    ...original,
    operationId: id(1651),
    expectedRevision: receipt.revision,
    token: "ExponentPushToken[CancelledRace]",
  };
  const { store, operations } = f.make(),
    checkpoint = f.checkpoint();
  let first = true;
  const matches = (...args) =>
    Effect.gen(function* () {
      const result = yield* checkpoint.matches(...args);
      if (first) {
        first = false;
        yield* Effect.promise(() => store.stage(f.account, pending));
        yield* operations.cancelPending();
      }
      return result;
    });
  await assert.rejects(
    run(
      rotatePushDevice({
        current: () => true,
        checkpoint: { ...checkpoint, matches },
        client: f.client,
        operations,
        operationId: () => id(1652),
        readInstallation: Effect.succeed(original.installationId),
        token: Effect.succeed(pending.token),
      }),
    ),
  );
  assert.equal(await store.read(f.account), null);
  assert.equal(f.db.sql("select count(*) from private.nest_push_device_operations"), "1");
});
