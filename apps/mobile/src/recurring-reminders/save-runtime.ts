import type {
  SaveRecurringReminder,
  RecurringReminderRecovery,
} from "@nest/contracts/recurring-reminders";
import { recurringReminderAttempt } from "./save-attempt.ts";
import type { RecurringReminderSaveOperations } from "./save-operations.ts";
import { DurableSaveRuntime } from "../money/durable-save-runtime.ts";
export class RecurringReminderSaveRuntime extends DurableSaveRuntime<
  typeof SaveRecurringReminder.Type,
  typeof RecurringReminderRecovery.Type
> {
  constructor(operations: RecurringReminderSaveOperations) {
    super(operations, { prepare: recurringReminderAttempt, label: "reminder change" });
  }
  abandon = this.cancel;
}
