import test from "node:test";
import assert from "node:assert/strict";
import { apnsDeliveryFixture, id } from "./apns-delivery-fixture.mjs";
test("APNs invalidation timestamps preserve newer registrations while known current invalid tokens disable", (t) => {
  for (const invalidatedAt of [0, Date.now() + 60_000, undefined]) {
    const f = apnsDeliveryFixture(t),
      delivery = f.renewalPrepare(),
      attempt = f.beginApns(delivery);
    const result = {
      status: "rejected",
      reason: "invalid_device",
      ...(invalidatedAt === undefined ? {} : { invalidatedAt }),
    };
    f.finish(delivery, attempt.attemptId, result);
    assert.equal(
      f.db.sql(
        `select token is not null from private.nest_push_devices where installation_id='${id(1702)}'`,
      ),
      invalidatedAt === 0 ? "t" : "f",
    );
  }
});
test("a delayed rejection cannot disable a rotated token or a different provider association", (t) => {
  for (const expo of [false, true]) {
    const f = apnsDeliveryFixture(t),
      delivery = f.renewalPrepare(),
      attempt = f.beginApns(delivery);
    const rotated = {
      ...f.command,
      operationId: id(2801),
      expectedRevision: attempt.registrationRevision,
      token: expo ? "ExponentPushToken[RotatedFixture]" : "ffeeaa",
    };
    if (expo) {
      delete rotated.provider;
      delete rotated.environment;
    }
    const receipt = f.execute(f.save(rotated));
    f.finish(delivery, attempt.attemptId, {
      status: "rejected",
      reason: "invalid_device",
      invalidatedAt: Date.now() + 60_000,
    });
    assert.equal(
      f.db.sql(
        `select revision from private.nest_push_devices where installation_id='${id(1702)}'`,
      ),
      receipt.revision,
    );
    assert.equal(
      f.db.sql(`select token from private.nest_push_devices where installation_id='${id(1702)}'`),
      rotated.token,
    );
  }
});
