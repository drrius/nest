import * as Schema from "effect/Schema";
import {
  ChoreReminderInput,
  ChoreReminderReceipt,
  canonicalChoreReminder,
  sameChoreReminderCommand,
} from "@nest/contracts/chore-reminders";
export function matchesChoreReminderReceipt(
  action: string,
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
): boolean | null {
  if (action !== "saveChoreReminder") return null;
  if (!Schema.is(ChoreReminderInput)(input) || !Schema.is(ChoreReminderReceipt)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    sameChoreReminderCommand(
      canonicalChoreReminder({ ...input, operationId: receipt.operationId }),
      receipt.command,
    )
  );
}
