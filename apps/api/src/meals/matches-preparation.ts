import * as Schema from "effect/Schema";
import {
  CreateMealPreparationInput,
  MealPreparationReceipt,
} from "@nest/contracts/meal-preparation";
export function matchesPreparation(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(CreateMealPreparationInput)(input) || !Schema.is(MealPreparationReceipt)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.entryId === input.entryId.toLowerCase() &&
    receipt.weekStart === input.weekStart &&
    receipt.revision === input.expectedRevision &&
    receipt.dueOn === input.preparation.dueOn
  );
}
