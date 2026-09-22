import test from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  PushDeviceCommand,
  PushDeviceReceipt,
  PushDeviceState,
  canonicalPushDevice,
  pushDeviceDigestInput,
  matchesPushDeviceReceipt,
} from "../../packages/contracts/src/push-registration.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
const command = {
  operationId: id(1),
  installationId: id(2),
  expectedRevision: null,
  action: "register",
  token: "ExponentPushToken[Fixture_ONLY]",
};
test("device command binds installation and revision without accepting caller authority", () => {
  assert.deepEqual(decode(PushDeviceCommand, command), command);
  for (const key of ["actorId", "householdId", "enabled", "platform"])
    assert.throws(() => decode(PushDeviceCommand, { ...command, [key]: id(3) }));
  for (const token of ["", " token", "token\n", "x".repeat(4097)])
    assert.throws(() => decode(PushDeviceCommand, { ...command, token }));
  assert.throws(() => decode(PushDeviceCommand, { ...command, action: "disable" }));
  const { token: _, ...disabled } = { ...command, action: "disable" };
  assert.deepEqual(decode(PushDeviceCommand, disabled), disabled);
  const { expectedRevision: __, ...missingBaseline } = command;
  assert.throws(() => decode(PushDeviceCommand, missingBaseline));
  assert.equal(canonicalPushDevice(command).token, command.token);
});
test("device read and receipt payloads reject tokens and impossible registration states", () => {
  const receipt = {
    version: 1,
    actorId: id(3),
    householdId: id(4),
    operationId: id(1),
    installationId: id(2),
    expectedRevision: null,
    revision: id(5),
    action: "register",
    commandDigest: "a".repeat(64),
  };
  assert.deepEqual(decode(PushDeviceReceipt, receipt), receipt);
  const sameRevision = "123e4567-e89b-4000-8000-000000000001";
  assert.throws(() =>
    decode(PushDeviceReceipt, {
      ...receipt,
      expectedRevision: sameRevision,
      revision: sameRevision.toUpperCase(),
    }),
  );
  assert.throws(() => decode(PushDeviceReceipt, { ...receipt, token: command.token }));
  assert.throws(() => decode(PushDeviceReceipt, { ...receipt, expectedRevision: id(5) }));
  assert.throws(() =>
    decode(PushDeviceReceipt, { ...receipt, commandDigest: `${receipt.commandDigest}\n` }),
  );
  const state = {
    version: 1,
    actorId: id(3),
    householdId: id(4),
    installationId: id(2),
    revision: null,
    enabled: false,
  };
  assert.deepEqual(decode(PushDeviceState, state), state);
  assert.throws(() => decode(PushDeviceState, { ...state, enabled: true }));
  assert.throws(() => decode(PushDeviceState, { ...state, token: command.token }));
});

test("registration receipt binds every command field and account without returning a token", () => {
  const actor = id(3),
    home = id(4);
  const digest = (value, a = actor, h = home) =>
    createHash("sha256")
      .update(pushDeviceDigestInput(value, a, h), "utf8")
      .digest("hex");
  const receipt = {
    version: 1,
    actorId: actor,
    householdId: home,
    operationId: command.operationId,
    installationId: command.installationId,
    expectedRevision: null,
    revision: id(5),
    action: "register",
    commandDigest: digest(command),
  };
  assert.ok(
    matchesPushDeviceReceipt(receipt, command, {
      actorId: actor,
      householdId: home,
      commandDigest: digest(command),
    }),
  );
  for (const changed of [
    { ...command, operationId: id(8) },
    { ...command, installationId: id(8) },
    { ...command, expectedRevision: id(8) },
    { ...command, token: `${command.token}x` },
    {
      operationId: command.operationId,
      installationId: command.installationId,
      expectedRevision: null,
      action: "disable",
    },
  ]) {
    assert.notEqual(digest(changed), receipt.commandDigest);
    assert.equal(
      matchesPushDeviceReceipt(receipt, changed, {
        actorId: actor,
        householdId: home,
        commandDigest: digest(changed),
      }),
      false,
    );
  }
  assert.notEqual(digest(command, id(8)), receipt.commandDigest);
  assert.notEqual(digest(command, actor, id(8)), receipt.commandDigest);
  assert.equal(
    matchesPushDeviceReceipt(receipt, command, {
      actorId: id(8),
      householdId: home,
      commandDigest: digest(command, id(8)),
    }),
    false,
  );
  assert.equal(
    matchesPushDeviceReceipt(receipt, command, {
      actorId: actor,
      householdId: id(8),
      commandDigest: digest(command, actor, id(8)),
    }),
    false,
  );
  assert.equal(JSON.stringify(receipt).includes(command.token), false);
});
