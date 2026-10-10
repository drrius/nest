import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { apnsRegistrationFixture, id, json } from "./apns-registration-fixture.mjs";
import { pushDeviceDigestInput } from "../../packages/contracts/src/push-registration.ts";
test("SQL APNs validation matches canonical client digests for both environments and token boundaries", (t) => {
  const f = apnsRegistrationFixture(t);
  for (let i = 0; i < 24; i++) {
    const command = {
      ...f.command(),
      environment: i % 2 ? "sandbox" : "production",
      token: "0123456789abcdef".repeat(i + 1),
      expectedRevision: i % 3 ? null : id(2702),
    };
    assert.deepEqual(
      JSON.parse(f.db.sql(`select private.nest_push_device_command(${json(command)})`)),
      command,
    );
    assert.equal(
      f.db.sql(`select private.nest_push_device_digest(${json(command)},'${id(1)}','${id(10)}')`),
      createHash("sha256")
        .update(pushDeviceDigestInput(command, id(1), id(10)))
        .digest("hex"),
    );
  }
  for (const token of ["af", "af".repeat(2048)])
    assert.equal(
      JSON.parse(
        f.db.sql(`select private.nest_push_device_command(${json({ ...f.command(), token })})`),
      ).token,
      token,
    );
  const base = f.command();
  for (const patch of [
    { token: "a" },
    { token: "AF" },
    { token: "af\n" },
    { token: "af".repeat(2049) },
    { token: "ExponentPushToken[x]" },
    { provider: "expo" },
    { environment: null },
    { provider: null },
    { environment: "sandbox\n" },
    { actorId: id(2) },
    { action: "disable" },
  ])
    assert.throws(
      () => f.db.sql(`select private.nest_push_device_command(${json({ ...base, ...patch })})`),
      /Invalid/,
    );
  for (const key of ["provider", "environment", "expectedRevision"]) {
    const value = { ...base };
    delete value[key];
    assert.throws(
      () => f.db.sql(`select private.nest_push_device_command(${json(value)})`),
      /Invalid/,
    );
  }
});
