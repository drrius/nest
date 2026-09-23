import * as Schema from "effect/Schema";
import { Grocery, GroceryVersion } from "./groceries.ts";
import { DatedReminderSettings, canonicalDatedReminderSettings } from "./dated-reminders.ts";
const Uuid = Grocery.fields.itemId;
const ItemVersion = GroceryVersion.check(Schema.isPattern(/^[1-9][0-9]{0,18}$(?![\s\S])/));
export const GroceryReminderInput = Schema.Struct({
  itemId: Uuid,
  expectedItemVersion: ItemVersion,
  expectedRevision: Schema.NullOr(Uuid),
  settings: DatedReminderSettings,
});
export const SaveGroceryReminder = Schema.Struct({
  operationId: Uuid,
  ...GroceryReminderInput.fields,
});
export const GroceryReminder = Schema.Struct({
  itemId: Uuid,
  revision: Uuid,
  reviewedItemVersion: ItemVersion,
  updatedBy: Uuid,
  settings: DatedReminderSettings,
});
export const GroceryReminderContext = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  itemVersion: ItemVersion,
  grocery: Grocery,
  reminder: Schema.NullOr(GroceryReminder),
}).check(
  Schema.makeFilter(
    (value) =>
      value.itemVersion === value.grocery.version &&
      (value.reminder === null || value.reminder.itemId === value.grocery.itemId),
  ),
);
const sameSettings = Schema.toEquivalence(DatedReminderSettings);
export const GroceryReminderReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  command: SaveGroceryReminder,
  reminder: GroceryReminder,
}).check(
  Schema.makeFilter(
    (value) =>
      value.operationId === value.command.operationId &&
      value.actorId === value.reminder.updatedBy &&
      value.command.itemId === value.reminder.itemId &&
      value.command.expectedItemVersion === value.reminder.reviewedItemVersion &&
      value.command.expectedRevision !== value.reminder.revision &&
      sameSettings(value.command.settings, value.reminder.settings),
  ),
);
export const GroceryReminderQuery = Schema.Struct({ itemId: Uuid });
export function canonicalGroceryReminder(command: typeof SaveGroceryReminder.Type) {
  return {
    ...command,
    operationId: command.operationId.toLowerCase(),
    itemId: command.itemId.toLowerCase(),
    expectedRevision: command.expectedRevision?.toLowerCase() ?? null,
    settings: canonicalDatedReminderSettings(command.settings),
  };
}
export const sameGroceryReminderCommand = Schema.toEquivalence(SaveGroceryReminder);
export const GroceryReminderRecovery = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "cancelled", "recorded"]),
  receipt: Schema.NullOr(GroceryReminderReceipt),
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
