import * as Schema from "effect/Schema";
import { SaveMealReminder, canonicalMealReminder } from "@nest/contracts/meal-reminders";
export const MealReminderSaveAttempt = Schema.Struct({
  command: SaveMealReminder,
  action: Schema.Literals(["save", "cancel"]),
});
export type MealReminderSaveAttempt = typeof MealReminderSaveAttempt.Type;
export function mealReminderAttempt(input: typeof SaveMealReminder.Type): MealReminderSaveAttempt {
  const command = Schema.decodeUnknownSync(SaveMealReminder)(input, {
    onExcessProperty: "error",
  });
  return { action: "save", command: canonicalMealReminder(command) };
}
