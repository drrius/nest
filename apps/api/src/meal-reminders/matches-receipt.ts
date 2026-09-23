import * as Schema from "effect/Schema";
import {
  MealReminderInput,
  MealReminderReceipt,
  canonicalMealReminder,
  sameMealReminderCommand,
} from "@nest/contracts/meal-reminders";
export function matchesMealReminderReceipt(
  action: string,
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
): boolean | null {
  if (action !== "saveMealReminder") return null;
  if (!Schema.is(MealReminderInput)(input) || !Schema.is(MealReminderReceipt)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    sameMealReminderCommand(
      canonicalMealReminder({ ...input, operationId: receipt.operationId }),
      receipt.command,
    )
  );
}
