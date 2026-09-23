import * as Schema from "effect/Schema";
import { RecurringRule } from "./recurring-read.ts";
import { CalendarDate } from "./chores.ts";
import { ReminderSettings, canonicalReminderSettings } from "./reminders.ts";
const Uuid = RecurringRule.fields.ruleId;
export const RecurringReminderInput = Schema.Struct({
  ruleId: Uuid,
  expectedRuleRevision: Uuid,
  expectedDueOn: CalendarDate,
  expectedRevision: Schema.NullOr(Uuid),
  settings: ReminderSettings,
});
export const SaveRecurringReminder = Schema.Struct({
  operationId: Uuid,
  ...RecurringReminderInput.fields,
});
export const RecurringReminder = Schema.Struct({
  ruleId: Uuid,
  revision: Uuid,
  reviewedRuleRevision: Uuid,
  reviewedDueOn: CalendarDate,
  updatedBy: Uuid,
  settings: ReminderSettings,
});
export const RecurringReminderContext = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  rule: RecurringRule,
  reminder: Schema.NullOr(RecurringReminder),
}).check(
  Schema.makeFilter(
    (value) => value.reminder === null || value.reminder.ruleId === value.rule.ruleId,
  ),
);
const sameSettings = Schema.toEquivalence(ReminderSettings);
export const RecurringReminderReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  command: SaveRecurringReminder,
  reminder: RecurringReminder,
}).check(
  Schema.makeFilter(
    (value) =>
      value.operationId === value.command.operationId &&
      value.actorId === value.reminder.updatedBy &&
      value.command.ruleId === value.reminder.ruleId &&
      value.command.expectedRuleRevision === value.reminder.reviewedRuleRevision &&
      value.command.expectedDueOn === value.reminder.reviewedDueOn &&
      value.command.expectedRevision !== value.reminder.revision &&
      sameSettings(value.command.settings, value.reminder.settings),
  ),
);
export const RecurringReminderQuery = Schema.Struct({ ruleId: Uuid });
export function canonicalRecurringReminder(command: typeof SaveRecurringReminder.Type) {
  return {
    ...command,
    operationId: command.operationId.toLowerCase(),
    ruleId: command.ruleId.toLowerCase(),
    expectedRuleRevision: command.expectedRuleRevision.toLowerCase(),
    expectedRevision: command.expectedRevision?.toLowerCase() ?? null,
    settings: canonicalReminderSettings(command.settings),
  };
}
export const sameRecurringReminderCommand = Schema.toEquivalence(SaveRecurringReminder);
export const RecurringReminderRecovery = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "cancelled", "recorded"]),
  receipt: Schema.NullOr(RecurringReminderReceipt),
}).check(
  Schema.makeFilter((value) => {
    if (value.status !== "recorded") return value.receipt === null;
    const receipt = value.receipt;
    return (
      receipt !== null &&
      receipt.actorId === value.actorId &&
      receipt.householdId === value.householdId &&
      receipt.operationId === value.operationId
    );
  }),
);
