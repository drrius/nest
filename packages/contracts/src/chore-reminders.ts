import * as Schema from "effect/Schema";
import { Chore } from "./chores.ts";
import { ReminderSettings, canonicalReminderSettings } from "./reminders.ts";
const Uuid = Chore.fields.occurrenceId;
// Opaque server fingerprint of the reviewed occurrence and routine state.
export const ChoreReminderBaseline = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$(?![\s\S])/),
);
export const ChoreReminderInput = Schema.Struct({
  occurrenceId: Uuid,
  expectedItemRevision: ChoreReminderBaseline,
  expectedRevision: Schema.NullOr(Uuid),
  settings: ReminderSettings,
});
export const SaveChoreReminder = Schema.Struct({
  operationId: Uuid,
  ...ChoreReminderInput.fields,
});
export const ChoreReminder = Schema.Struct({
  occurrenceId: Uuid,
  revision: Uuid,
  reviewedItemRevision: ChoreReminderBaseline,
  updatedBy: Uuid,
  settings: ReminderSettings,
});
export const ChoreReminderContext = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  itemRevision: ChoreReminderBaseline,
  chore: Chore,
  reminder: Schema.NullOr(ChoreReminder),
}).check(
  Schema.makeFilter(
    (value) => value.reminder === null || value.reminder.occurrenceId === value.chore.occurrenceId,
  ),
);
const sameSettings = Schema.toEquivalence(ReminderSettings);
export const ChoreReminderReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  command: SaveChoreReminder,
  reminder: ChoreReminder,
}).check(
  Schema.makeFilter(
    (value) =>
      value.operationId === value.command.operationId &&
      value.actorId === value.reminder.updatedBy &&
      value.command.occurrenceId === value.reminder.occurrenceId &&
      value.command.expectedItemRevision === value.reminder.reviewedItemRevision &&
      value.command.expectedRevision !== value.reminder.revision &&
      sameSettings(value.command.settings, value.reminder.settings),
  ),
);
export const ChoreReminderQuery = Schema.Struct({ occurrenceId: Uuid });
export function canonicalChoreReminder(command: typeof SaveChoreReminder.Type) {
  return {
    ...command,
    operationId: command.operationId.toLowerCase(),
    occurrenceId: command.occurrenceId.toLowerCase(),
    expectedRevision: command.expectedRevision?.toLowerCase() ?? null,
    settings: canonicalReminderSettings(command.settings),
  };
}
export const sameChoreReminderCommand = Schema.toEquivalence(SaveChoreReminder);
export const ChoreReminderRecovery = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "cancelled", "recorded"]),
  receipt: Schema.NullOr(ChoreReminderReceipt),
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
