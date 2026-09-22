import type { SaveRenewalReminder, RenewalReminderRecovery } from "@nest/contracts/reminders";
import { renewalReminderAttempt } from "./save-attempt.ts";
import type { RenewalReminderSaveOperations } from "./save-operations.ts";
import { DurableSaveRuntime } from "../money/durable-save-runtime.ts";
export class RenewalReminderSaveRuntime extends DurableSaveRuntime<
  typeof SaveRenewalReminder.Type,
  typeof RenewalReminderRecovery.Type
> {
  constructor(operations: RenewalReminderSaveOperations) {
    super(operations, { prepare: renewalReminderAttempt, label: "reminder change" });
  }
  abandon = this.cancel;
}
