import * as Schema from "effect/Schema";
import { SaveGroceryReminder, canonicalGroceryReminder } from "@nest/contracts/grocery-reminders";
export const GroceryReminderSaveAttempt = Schema.Struct({
  command: SaveGroceryReminder,
  action: Schema.Literals(["save", "cancel"]),
});
export type GroceryReminderSaveAttempt = typeof GroceryReminderSaveAttempt.Type;
export function groceryReminderAttempt(
  input: typeof SaveGroceryReminder.Type,
): GroceryReminderSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveGroceryReminder)(input, {
    onExcessProperty: "error",
  });
  return { action: "save", command: canonicalGroceryReminder(command) };
}
