import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fixture, id, json } from "./renewal-fixture.mjs";
import { pushDeviceDigestInput } from "../../packages/contracts/src/push-registration.ts";
test("SQL registration canonicalization and command digest match the client without API grants", (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260922223732_native_push_registration.sql");
  const base = {
    operationId: id(950),
    installationId: id(951),
    expectedRevision: null,
    action: "register",
    token: "ExponentPushToken[Fixture_ONLY]",
  };
  for (const command of [
    base,
    { ...base, expectedRevision: id(952), token: 'a\\b"c' },
    { operationId: id(953), installationId: id(951), expectedRevision: id(952), action: "disable" },
  ]) {
    const expected = createHash("sha256")
      .update(pushDeviceDigestInput(command, id(1), id(10)))
      .digest("hex");
    assert.equal(
      f.db.sql(`select private.nest_push_device_digest(${json(command)},'${id(1)}','${id(10)}')`),
      expected,
    );
    assert.deepEqual(
      JSON.parse(f.db.sql(`select private.nest_push_device_command(${json(command)})`)),
      command,
    );
  }
  for (const invalid of [
    { ...base, actorId: id(2) },
    { ...base, token: "token\n" },
    { ...base, token: "é" },
    { ...base, token: "" },
    { ...base, token: "x".repeat(4097) },
    { ...base, action: "disable" },
  ])
    assert.throws(
      () => f.db.sql(`select private.nest_push_device_command(${json(invalid)})`),
      /Invalid device/,
    );
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(
      () => f.db.sql(`set role ${role}; select private.nest_push_device_command(${json(base)})`),
      /permission denied/,
    );
});
