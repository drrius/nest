import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  SaveMealReminder,
  MealReminderReceipt,
  MealReminderContext,
  MealReminderRecovery,
} from "../../packages/contracts/src/meal-reminders.ts";
import { id } from "./recurring-transport-fixture.mjs";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
const settings = { enabled: true, recipientIds: [id(1)], localTime: "09:00", daysBefore: 0 };
const command = {
  operationId: id(100),
  entryId: id(200),
  expectedItemRevision: "a".repeat(64),
  expectedRevision: null,
  settings,
};
const reminder = {
  entryId: id(200),
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
test("meal reminder command binds item and schedule baselines without mute override", () => {
  assert.deepEqual(decode(SaveMealReminder, command), command);
  for (const patch of [
    { expectedItemRevision: null },
    { expectedItemRevision: "a".repeat(64) + "\n" },
    { expectedRevision: "old" },
    { householdId: id(99) },
    { settings: { ...settings, overrideMute: true } },
  ])
    assert.throws(() => decode(SaveMealReminder, { ...command, ...patch }));
});
test("meal reminder receipts reject substituted actor, item, reviewed terms and unchanged revision", () => {
  assert.deepEqual(decode(MealReminderReceipt, receipt), receipt);
  for (const patch of [
    { actorId: id(2) },
    { operationId: id(101) },
    { reminder: { ...reminder, entryId: id(201) } },
    { reminder: { ...reminder, reviewedItemRevision: "b".repeat(64) } },
    { reminder: { ...reminder, settings: { ...settings, recipientIds: [id(2)] } } },
    { command: { ...command, expectedRevision: reminder.revision } },
  ])
    assert.throws(() => decode(MealReminderReceipt, { ...receipt, ...patch }));
  const context = {
    version: 1,
    householdId: id(10),
    itemRevision: "b".repeat(64),
    meal: {
      entryId: id(200),
      title: "Dinner",
      date: "2026-09-23",
      slot: "dinner",
      recipeUrl: null,
      notes: null,
      definitionId: null,
      leftoverSourceId: null,
    },
    reminder,
  };
  // Current context can expose an outdated reminder so the editor can explain invalidation.
  assert.deepEqual(decode(MealReminderContext, context), context);
  assert.throws(() =>
    decode(MealReminderContext, { ...context, reminder: { ...reminder, entryId: id(201) } }),
  );
});

test("meal reminder recovery cannot substitute receipt identity or report success without a receipt", () => {
  const recovery = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(100),
    status: "recorded",
    receipt,
  };
  assert.deepEqual(decode(MealReminderRecovery, recovery), recovery);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(101) },
    { receipt: null },
    { status: "cancelled" },
    { status: "unresolved" },
  ])
    assert.throws(() => decode(MealReminderRecovery, { ...recovery, ...patch }));
});
