import * as Schema from "effect/Schema";
import { PlannedMeal } from "./meals.ts";
import { ReminderSettings, canonicalReminderSettings } from "./reminders.ts";
const Uuid = PlannedMeal.fields.entryId;
// Opaque server fingerprint of the reviewed saved meal entry state.
export const MealReminderBaseline = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$(?![\s\S])/),
);
export const MealReminderInput = Schema.Struct({
  entryId: Uuid,
  expectedItemRevision: MealReminderBaseline,
  expectedRevision: Schema.NullOr(Uuid),
  settings: ReminderSettings,
});
export const SaveMealReminder = Schema.Struct({
  operationId: Uuid,
  ...MealReminderInput.fields,
});
export const MealReminder = Schema.Struct({
  entryId: Uuid,
  revision: Uuid,
  reviewedItemRevision: MealReminderBaseline,
  updatedBy: Uuid,
  settings: ReminderSettings,
});
export const MealReminderContext = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  itemRevision: MealReminderBaseline,
  meal: PlannedMeal,
  reminder: Schema.NullOr(MealReminder),
}).check(
  Schema.makeFilter(
    (value) => value.reminder === null || value.reminder.entryId === value.meal.entryId,
  ),
);
const sameSettings = Schema.toEquivalence(ReminderSettings);
export const MealReminderReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  command: SaveMealReminder,
  reminder: MealReminder,
}).check(
  Schema.makeFilter(
    (value) =>
      value.operationId === value.command.operationId &&
      value.actorId === value.reminder.updatedBy &&
      value.command.entryId === value.reminder.entryId &&
      value.command.expectedItemRevision === value.reminder.reviewedItemRevision &&
      value.command.expectedRevision !== value.reminder.revision &&
      sameSettings(value.command.settings, value.reminder.settings),
  ),
);
export const MealReminderQuery = Schema.Struct({ entryId: Uuid });
export function canonicalMealReminder(command: typeof SaveMealReminder.Type) {
  return {
    ...command,
    operationId: command.operationId.toLowerCase(),
    entryId: command.entryId.toLowerCase(),
    expectedRevision: command.expectedRevision?.toLowerCase() ?? null,
    settings: canonicalReminderSettings(command.settings),
  };
}
export const sameMealReminderCommand = Schema.toEquivalence(SaveMealReminder);
export const MealReminderRecovery = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "cancelled", "recorded"]),
  receipt: Schema.NullOr(MealReminderReceipt),
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
