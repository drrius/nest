import * as Schema from "effect/Schema";
import { SaveChoreReminder, canonicalChoreReminder } from "@nest/contracts/chore-reminders";
export const ChoreReminderSaveAttempt = Schema.Struct({
  command: SaveChoreReminder,
  action: Schema.Literals(["save", "cancel"]),
});
export type ChoreReminderSaveAttempt = typeof ChoreReminderSaveAttempt.Type;
export function choreReminderAttempt(
  input: typeof SaveChoreReminder.Type,
): ChoreReminderSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveChoreReminder)(input, {
    onExcessProperty: "error",
  });
  return { action: "save", command: canonicalChoreReminder(command) };
}
