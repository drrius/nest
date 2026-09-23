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
  const make = () => {
    const store = protectedPushAttempts(disk);
    return {
      store,
      operations: pushEnrollmentOperations({ account, client, store, current: () => true }),
    };
  };
  const command = (op) => ({
    action: "register",
    operationId: id(op),
    installationId: id(1600),
    expectedRevision: null,
    token: "ExponentPushToken[CancelFixture]",
  });
  return { ...f, account, client, make, command, values };
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
  assert.equal(f.values.size, 0);
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
  assert.equal(f.values.size, 0);
  await assert.rejects(run(f.client.cancel({ ...command, token: "different" })));
  assert.equal(f.db.sql("select count(*) from private.nest_push_cancelled_operations"), "0");
});
