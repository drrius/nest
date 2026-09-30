import * as Schema from "effect/Schema";
import {
  SaveRecurringReminder,
  canonicalRecurringReminder,
} from "@nest/contracts/recurring-reminders";
export const RecurringReminderSaveAttempt = Schema.Struct({
  command: SaveRecurringReminder,
  action: Schema.Literals(["save", "cancel"]),
});
export type RecurringReminderSaveAttempt = typeof RecurringReminderSaveAttempt.Type;
export function recurringReminderAttempt(
  input: typeof SaveRecurringReminder.Type,
): RecurringReminderSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveRecurringReminder)(input, {
    onExcessProperty: "error",
  });
  return { action: "save", command: canonicalRecurringReminder(command) };
}
