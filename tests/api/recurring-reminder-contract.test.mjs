import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  SaveRecurringReminder,
  RecurringReminderReceipt,
  RecurringReminderRecovery,
} from "../../packages/contracts/src/recurring-reminders.ts";
import { id } from "./recurring-transport-fixture.mjs";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const decode = (schema, value) =>
  Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" });
const settings = {
  enabled: true,
  recipientIds: [id(1)],
  localTime: "09:00",
  daysBefore: 1,
};
const command = {
  operationId: id(100),
  ruleId: id(200),
  expectedRuleRevision: id(400),
  expectedDueOn: "2026-09-25",
  expectedRevision: null,
  settings,
};
const reminder = {
  ruleId: id(200),
  revision: id(300),
  reviewedRuleRevision: command.expectedRuleRevision,
  reviewedDueOn: command.expectedDueOn,
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
test("recurring reminder command binds item and schedule baselines without mute override", () => {
  assert.deepEqual(decode(SaveRecurringReminder, command), command);
  for (const patch of [
    { expectedRuleRevision: null },
    { expectedDueOn: "2026-02-30" },
    { amountCentimes: 500 },
    { approved: true },
    { expectedRevision: "old" },
    { householdId: id(99) },
    { settings: { ...settings, overrideMute: true } },
  ])
    assert.throws(() => decode(SaveRecurringReminder, { ...command, ...patch }));
});
test("recurring reminder receipts reject substituted actor, item, reviewed terms and unchanged revision", () => {
  assert.deepEqual(decode(RecurringReminderReceipt, receipt), receipt);
  for (const patch of [
    { reminder: { ...reminder, reviewedDueOn: "2026-09-26" } },
    { actorId: id(2) },
    { operationId: id(101) },
    { reminder: { ...reminder, ruleId: id(201) } },
    { reminder: { ...reminder, reviewedRuleRevision: id(401) } },
    { reminder: { ...reminder, settings: { ...settings, recipientIds: [id(2)] } } },
    { command: { ...command, expectedRevision: reminder.revision } },
  ])
    assert.throws(() => decode(RecurringReminderReceipt, { ...receipt, ...patch }));
});

test("recurring reminder recovery cannot substitute receipt identity or report success without a receipt", () => {
  const recovery = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(100),
    status: "recorded",
    receipt,
  };
  assert.deepEqual(decode(RecurringReminderRecovery, recovery), recovery);
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(101) },
    { receipt: null },
    { status: "cancelled" },
    { status: "unresolved" },
  ])
    assert.throws(() => decode(RecurringReminderRecovery, { ...recovery, ...patch }));
});
