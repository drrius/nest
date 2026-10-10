import type { SaveChoreReminder, ChoreReminderRecovery } from "@nest/contracts/chore-reminders";
import { choreReminderAttempt } from "./save-attempt.ts";
import type { ChoreReminderSaveOperations } from "./save-operations.ts";
import { DurableSaveRuntime } from "../money/durable-save-runtime.ts";
export class ChoreReminderSaveRuntime extends DurableSaveRuntime<
  typeof SaveChoreReminder.Type,
  typeof ChoreReminderRecovery.Type
> {
  constructor(operations: ChoreReminderSaveOperations) {
    super(operations, { prepare: choreReminderAttempt, label: "reminder change" });
  }
  abandon = this.cancel;
}
