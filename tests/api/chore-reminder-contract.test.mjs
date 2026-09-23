import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  SaveChoreReminder,
  ChoreReminderReceipt,
  ChoreReminderContext,
  ChoreReminderRecovery,
} from "../../packages/contracts/src/chore-reminders.ts";
import { id } from "./recurring-transport-fixture.mjs";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
const settings = { enabled: true, recipientIds: [id(1)], localTime: "09:00", daysBefore: 0 };
const command = {
  operationId: id(100),
  occurrenceId: id(200),
  expectedItemRevision: "a".repeat(64),
  expectedRevision: null,
  settings,
};
const reminder = {
  occurrenceId: id(200),
  revision: id(300),
  reviewedItemRevision: command.expectedItemRevision,
  updatedBy: id(1),
  settings,
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(100),
  command,
  reminder,
};
test("chore reminder command binds item and schedule baselines without mute override", () => {
  assert.deepEqual(decode(SaveChoreReminder, command), command);
  for (const patch of [
    { expectedItemRevision: null },
    { expectedItemRevision: "a".repeat(64) + "\n" },
    { expectedRevision: "old" },
    { householdId: id(99) },
    { settings: { ...settings, overrideMute: true } },
  ])
    assert.throws(() => decode(SaveChoreReminder, { ...command, ...patch }));
});
test("chore reminder receipts reject substituted actor, item, reviewed terms and unchanged revision", () => {
  assert.deepEqual(decode(ChoreReminderReceipt, receipt), receipt);
  for (const patch of [
    { actorId: id(2) },
    { operationId: id(101) },
    { reminder: { ...reminder, occurrenceId: id(201) } },
    { reminder: { ...reminder, reviewedItemRevision: "b".repeat(64) } },
    { reminder: { ...reminder, settings: { ...settings, recipientIds: [id(2)] } } },
    { command: { ...command, expectedRevision: reminder.revision } },
  ])
    assert.throws(() => decode(ChoreReminderReceipt, { ...receipt, ...patch }));
  const context = {
    version: 1,
    householdId: id(10),
    itemRevision: "b".repeat(64),
    chore: { occurrenceId: id(200), title: "Clean", dueDate: "2026-09-23", assigneeId: id(1) },
    reminder,
  };
  // Current context can expose an outdated reminder so the editor can explain invalidation.
  assert.deepEqual(decode(ChoreReminderContext, context), context);
  assert.throws(() =>
    decode(ChoreReminderContext, { ...context, reminder: { ...reminder, occurrenceId: id(201) } }),
  );
});

test("chore reminder recovery cannot substitute receipt identity or report success without a receipt", () => {
  const recovery = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(100),
    status: "recorded",
    receipt,
  };
  assert.deepEqual(decode(ChoreReminderRecovery, recovery), recovery);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(101) },
    { receipt: null },
    { status: "cancelled" },
    { status: "unresolved" },
  ])
    assert.throws(() => decode(ChoreReminderRecovery, { ...recovery, ...patch }));
});
