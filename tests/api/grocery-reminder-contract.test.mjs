import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  SaveGroceryReminder,
  GroceryReminderReceipt,
  GroceryReminderContext,
  GroceryReminderRecovery,
} from "../../packages/contracts/src/grocery-reminders.ts";
import { id } from "./recurring-transport-fixture.mjs";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
const settings = {
  enabled: true,
  recipientIds: [id(1)],
  localTime: "09:00",
  localDate: "2026-09-25",
};
const command = {
  operationId: id(100),
  itemId: id(200),
  expectedItemVersion: "1",
  expectedRevision: null,
  settings,
};
const reminder = {
  itemId: id(200),
  revision: id(300),
  reviewedItemVersion: command.expectedItemVersion,
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
test("grocery reminder command binds item and schedule baselines without mute override", () => {
  assert.deepEqual(decode(SaveGroceryReminder, command), command);
  for (const patch of [
    { expectedItemVersion: null },
    { expectedItemVersion: "1" + "\n" },
    { expectedRevision: "old" },
    { householdId: id(99) },
    { settings: { ...settings, overrideMute: true } },
  ])
    assert.throws(() => decode(SaveGroceryReminder, { ...command, ...patch }));
});
test("grocery reminder receipts reject substituted actor, item, reviewed terms and unchanged revision", () => {
  assert.deepEqual(decode(GroceryReminderReceipt, receipt), receipt);
  for (const patch of [
    { actorId: id(2) },
    { operationId: id(101) },
    { reminder: { ...reminder, itemId: id(201) } },
    { reminder: { ...reminder, reviewedItemVersion: "2" } },
    { reminder: { ...reminder, settings: { ...settings, recipientIds: [id(2)] } } },
    { command: { ...command, expectedRevision: reminder.revision } },
  ])
    assert.throws(() => decode(GroceryReminderReceipt, { ...receipt, ...patch }));
  const context = {
    version: 1,
    householdId: id(10),
    itemVersion: "2",
    grocery: {
      itemId: id(200),
      name: "Milk",
      quantity: null,
      unit: null,
      categoryId: null,
      version: "2",
      checked: false,
      legacyClaimed: false,
    },
    reminder,
  };
  assert.throws(() => decode(GroceryReminderContext, { ...context, itemVersion: "3" }));
  // Current context can expose an outdated reminder so the editor can explain invalidation.
  assert.deepEqual(decode(GroceryReminderContext, context), context);
  assert.throws(() =>
    decode(GroceryReminderContext, { ...context, reminder: { ...reminder, itemId: id(201) } }),
  );
});

test("grocery reminder recovery cannot substitute receipt identity or report success without a receipt", () => {
  const recovery = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(100),
    status: "recorded",
    receipt,
  };
  assert.deepEqual(decode(GroceryReminderRecovery, recovery), recovery);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(101) },
    { receipt: null },
    { status: "cancelled" },
    { status: "unresolved" },
  ])
    assert.throws(() => decode(GroceryReminderRecovery, { ...recovery, ...patch }));
});
