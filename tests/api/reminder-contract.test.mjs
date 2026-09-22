import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  ReminderSettings,
  SaveRenewalReminder,
  canonicalReminderSettings,
} from "../../packages/contracts/src/reminders.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const valid = { enabled: true, recipientIds: [id], localTime: "09:00", daysBefore: 0 };
const decode = (schema, input) =>
  Schema.decodeUnknownSync(schema)(input, { onExcessProperty: "error" });
test("reminder settings require explicit recipients and reject ambiguous time or authority", () => {
  assert.deepEqual(decode(ReminderSettings, valid), valid);
  for (const patch of [
    { recipientIds: [] },
    { recipientIds: [id, id.toUpperCase()] },
    { localTime: "24:00" },
    { localTime: "09:00\n" },
    { daysBefore: 1.5 },
    { daysBefore: 731 },
    { overrideMute: true },
  ]) {
    assert.throws(() => decode(ReminderSettings, { ...valid, ...patch }));
  }
  assert.equal(
    decode(ReminderSettings, { ...valid, enabled: false, recipientIds: [] }).enabled,
    false,
  );
  assert.deepEqual(
    canonicalReminderSettings({ ...valid, recipientIds: [id.toUpperCase()] }),
    valid,
  );
});
test("renewal reminder commands require both item and schedule baselines", () => {
  const command = {
    operationId: id,
    renewalId: id,
    expectedRenewalRevision: id,
    expectedRevision: null,
    settings: { anchor: "cancellation", delivery: valid },
  };
  assert.deepEqual(decode(SaveRenewalReminder, command), command);
  assert.throws(() => decode(SaveRenewalReminder, { ...command, expectedRenewalRevision: null }));
  assert.throws(() => decode(SaveRenewalReminder, { ...command, actorId: id }));
  assert.throws(() =>
    decode(SaveRenewalReminder, {
      ...command,
      settings: { ...command.settings, anchor: "payment" },
    }),
  );
});
test("reminder receipts bind the full reviewed settings and advance the schedule revision", async () => {
  const { RenewalReminderReceipt } = await import("../../packages/contracts/src/reminders.ts");
  const revision = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const command = {
    operationId: id,
    renewalId: id,
    expectedRenewalRevision: id,
    expectedRevision: id,
    settings: { anchor: "renewal", delivery: valid },
  };
  const receipt = {
    version: 1,
    actorId: id,
    householdId: id,
    operationId: id,
    command,
    reminder: {
      renewalId: id,
      revision,
      reviewedRenewalRevision: id,
      updatedBy: id,
      settings: command.settings,
    },
  };
  assert.deepEqual(decode(RenewalReminderReceipt, receipt), receipt);
  for (const patch of [
    { revision: id },
    { reviewedRenewalRevision: revision },
    { updatedBy: revision },
    { settings: { ...command.settings, delivery: { ...valid, localTime: "10:00" } } },
  ]) {
    assert.throws(() =>
      decode(RenewalReminderReceipt, { ...receipt, reminder: { ...receipt.reminder, ...patch } }),
    );
  }
});
test("reminder recovery cannot substitute another actor or operation", async () => {
  const { RenewalReminderRecovery } = await import("../../packages/contracts/src/reminders.ts");
  const revision = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const command = {
    operationId: id,
    renewalId: id,
    expectedRenewalRevision: id,
    expectedRevision: null,
    settings: { anchor: "renewal", delivery: valid },
  };
  const receipt = {
    version: 1,
    actorId: id,
    householdId: id,
    operationId: id,
    command,
    reminder: {
      renewalId: id,
      revision,
      reviewedRenewalRevision: id,
      updatedBy: id,
      settings: command.settings,
    },
  };
  const recovery = {
    version: 1,
    actorId: id,
    householdId: id,
    operationId: id,
    status: "recorded",
    receipt,
  };
  assert.deepEqual(decode(RenewalReminderRecovery, recovery), recovery);
  for (const patch of [
    { actorId: revision },
    { householdId: revision },
    { operationId: revision },
    { receipt: null },
    { status: "cancelled" },
  ]) {
    assert.throws(() => decode(RenewalReminderRecovery, { ...recovery, ...patch }));
  }
  assert.equal(
    decode(RenewalReminderRecovery, { ...recovery, status: "unresolved", receipt: null }).status,
    "unresolved",
  );
});
