import test from "node:test";
import assert from "node:assert/strict";
import { apnsRegistrationFixture, id } from "./apns-registration-fixture.mjs";
test("APNs enrollment preserves legacy receipts, exact replay and environment-bound rotation", (t) => {
  const f = apnsRegistrationFixture(t),
    base = f.command();
  assert.deepEqual(f.execute(f.recover(1701)), f.old);
  assert.equal(f.execute(f.read(1702)).enabled, true);
  const receipt = f.execute(f.save(base));
  assert.deepEqual(f.execute(f.save(base)), receipt);
  assert.equal(JSON.stringify(receipt).includes(base.token), false);
  assert.throws(
    () => f.execute(f.save({ ...base, environment: "production" })),
    /operation changed/,
  );
  assert.throws(
    () => f.execute(f.save({ ...base, operationId: id(2702) })),
    /registration changed/,
  );
  const rotated = f.execute(
    f.save({
      ...base,
      operationId: id(2703),
      expectedRevision: receipt.revision,
      environment: "production",
    }),
  );
  assert.equal(f.execute(f.read()).environment, "production");
  const disabled = {
    action: "disable",
    operationId: id(2704),
    installationId: base.installationId,
    expectedRevision: rotated.revision,
  };
  f.execute(f.save(disabled));
  assert.deepEqual(f.execute(f.save(base)), receipt);
  assert.equal(f.execute(f.read()).enabled, false);
  assert.equal(f.execute(f.read()).environment, "production");
  assert.throws(
    () => f.db.sql("delete from private.nest_push_device_operations"),
    /immutable|append.only|cannot/i,
  );
});
test("APNs tokens have one owner per provider/environment and transfer only after disable", (t) => {
  const f = apnsRegistrationFixture(t),
    base = f.command();
  const receipt = f.execute(f.save(base));
  assert.throws(() => f.execute(f.save({ ...f.command(2710, 2711) }), 2), /duplicate key/);
  const production = { ...f.command(2712, 2713), environment: "production" };
  assert.equal(f.execute(f.save(production), 2).actorId, id(2));
  const { provider: _, environment: __, ...legacy } = f.command(2714, 2715);
  assert.equal(f.execute(f.save(legacy), 2).actorId, id(2));
  assert.throws(
    () => f.execute(f.save({ ...base, operationId: id(2716) }), 2),
    /Installation unavailable/,
  );
  f.execute(
    f.save({
      action: "disable",
      operationId: id(2717),
      installationId: base.installationId,
      expectedRevision: receipt.revision,
    }),
  );
  const transferred = f.execute(f.save({ ...base, operationId: id(2718) }), 2, 1703);
  assert.equal(transferred.actorId, id(2));
  assert.equal(f.execute(f.read()).revision, null);
  assert.equal(f.execute(f.read(), 2).revision, transferred.revision);
  f.execute("select public.nest_revoke_push_session()", 1);
  assert.equal(
    f.execute(f.read(), 2).enabled,
    true,
    "old account revocation cannot disable the new owner",
  );
  f.execute("select public.nest_revoke_push_session()", 2, 1703);
  assert.equal(f.execute(f.read(), 2).enabled, false);
  assert.throws(
    () => f.execute(f.save({ ...f.command(2719, 2720), token: "ffee" }), 2, 1703),
    /revoked/,
  );
});
test("APNs cancellation fences delayed enrollment and atomic replay survives concurrent saves", async (t) => {
  const f = apnsRegistrationFixture(t),
    base = f.command();
  f.execute(`select public.nest_cancel_push_device_operation('${id(10)}','${base.operationId}')`);
  assert.throws(() => f.execute(f.save(base)), /operation cancelled/);
  const next = f.command(2721, 2722);
  const values = await Promise.all(
    Array.from({ length: 3 }, () => f.db.concurrent(f.request(f.save(next)))),
  );
  const receipt = JSON.parse(values[0].stdout);
  for (const value of values) assert.deepEqual(JSON.parse(value.stdout), receipt);
  f.db.sql(
    `alter table private.nest_push_device_operations add constraint fixture_reject check(operation_id<>'${id(2723)}')`,
  );
  assert.throws(
    () =>
      f.execute(
        f.save({
          ...next,
          operationId: id(2723),
          expectedRevision: receipt.revision,
          token: "ffee",
        }),
      ),
    /fixture_reject/,
  );
  assert.equal(f.execute(f.read(2722)).revision, receipt.revision);
});
