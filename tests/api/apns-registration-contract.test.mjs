import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  PushDeviceCommand,
  PushDeviceState,
  pushDeviceDigestInput,
} from "../../packages/contracts/src/push-registration.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
const command = {
  action: "register",
  operationId: id(1),
  installationId: id(2),
  expectedRevision: null,
  provider: "apns",
  environment: "sandbox",
  token: "a1b2",
};
test("APNs commands require exact provider, environment and canonical variable-length bytes", () => {
  for (const size of [1, 2, 32, 64, 2048]) {
    const value = { ...command, token: "af".repeat(size) };
    assert.deepEqual(decode(PushDeviceCommand, value), value);
  }
  for (const token of ["", "a", "A1", "a1\n", "a1 ", " a1", "af".repeat(2049), "ExpoPushToken[x]"])
    assert.throws(() => decode(PushDeviceCommand, { ...command, token }));
  for (const patch of [
    { environment: "prod" },
    { environment: null },
    { provider: "expo" },
    { environment: undefined },
    { provider: undefined },
    { actorId: id(3) },
    { action: "disable" },
  ])
    assert.throws(() => decode(PushDeviceCommand, { ...command, ...patch }));
});
test("provider and environment change the exact digest while legacy commands keep their original domain", () => {
  const input = pushDeviceDigestInput(command, id(3), id(4));
  assert.equal(
    input,
    [
      "nest-push-device/apns-v1",
      id(3),
      id(4),
      id(1),
      id(2),
      "",
      "register",
      "a1b2",
      "apns",
      "sandbox",
    ].join("\n"),
  );
  assert.notEqual(
    input,
    pushDeviceDigestInput({ ...command, environment: "production" }, id(3), id(4)),
  );
  const { provider: _, environment: __, ...legacy } = command;
  assert.equal(
    pushDeviceDigestInput(legacy, id(3), id(4)),
    ["nest-push-device/v1", id(3), id(4), id(1), id(2), "", "register", "a1b2"].join("\n"),
  );
});
test("token-free APNs states retain the environment without changing legacy read shapes", () => {
  const common = {
    version: 1,
    actorId: id(3),
    householdId: id(4),
    installationId: id(2),
    revision: id(5),
    enabled: true,
  };
  assert.deepEqual(decode(PushDeviceState, common), common);
  const native = { ...common, provider: "apns", environment: "sandbox" };
  assert.deepEqual(decode(PushDeviceState, native), native);
  assert.deepEqual(decode(PushDeviceState, { ...native, enabled: false }), {
    ...native,
    enabled: false,
  });
  for (const patch of [
    { token: "a1b2" },
    { environment: null },
    { provider: "expo" },
    { environment: undefined },
    { revision: null },
  ])
    assert.throws(() => decode(PushDeviceState, { ...native, ...patch }));
});
