import * as Schema from "effect/Schema";
import {
  RecurringReminderInput,
  RecurringReminderReceipt,
  canonicalRecurringReminder,
  sameRecurringReminderCommand,
} from "@nest/contracts/recurring-reminders";
export function matchesRecurringReminderReceipt(
  action: string,
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
): boolean | null {
  if (action !== "saveRecurringReminder") return null;
  if (!Schema.is(RecurringReminderInput)(input) || !Schema.is(RecurringReminderReceipt)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    sameRecurringReminderCommand(
      canonicalRecurringReminder({ ...input, operationId: receipt.operationId }),
      receipt.command,
    )
  );
}
