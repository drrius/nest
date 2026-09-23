import type {
  SaveGroceryReminder,
  GroceryReminderRecovery,
} from "@nest/contracts/grocery-reminders";
import { groceryReminderAttempt } from "./save-attempt.ts";
import type { GroceryReminderSaveOperations } from "./save-operations.ts";
import { DurableSaveRuntime } from "../money/durable-save-runtime.ts";
export class GroceryReminderSaveRuntime extends DurableSaveRuntime<
  typeof SaveGroceryReminder.Type,
  typeof GroceryReminderRecovery.Type
> {
  constructor(operations: GroceryReminderSaveOperations) {
    super(operations, { prepare: groceryReminderAttempt, label: "reminder change" });
  }
  abandon = this.cancel;
}
