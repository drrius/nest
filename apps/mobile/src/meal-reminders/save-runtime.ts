import type { SaveMealReminder, MealReminderRecovery } from "@nest/contracts/meal-reminders";
import { mealReminderAttempt } from "./save-attempt.ts";
import type { MealReminderSaveOperations } from "./save-operations.ts";
import { DurableSaveRuntime } from "../money/durable-save-runtime.ts";
export class MealReminderSaveRuntime extends DurableSaveRuntime<
  typeof SaveMealReminder.Type,
  typeof MealReminderRecovery.Type
> {
  constructor(operations: MealReminderSaveOperations) {
    super(operations, { prepare: mealReminderAttempt, label: "reminder change" });
  }
  abandon = this.cancel;
}
