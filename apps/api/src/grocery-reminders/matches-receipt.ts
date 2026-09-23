import * as Schema from "effect/Schema";
import {
  GroceryReminderInput,
  GroceryReminderReceipt,
  canonicalGroceryReminder,
  sameGroceryReminderCommand,
} from "@nest/contracts/grocery-reminders";
export function matchesGroceryReminderReceipt(
  action: string,
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
): boolean | null {
  if (action !== "saveGroceryReminder") return null;
  if (!Schema.is(GroceryReminderInput)(input) || !Schema.is(GroceryReminderReceipt)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    sameGroceryReminderCommand(
      canonicalGroceryReminder({ ...input, operationId: receipt.operationId }),
      receipt.command,
    )
  );
}
