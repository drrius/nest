import {
  EditMealPreparationInput,
  MealPreparationEditReceipt,
} from "@nest/contracts/meal-preparation-edit";
import * as Schema from "effect/Schema";
import {
  CreateMealPreparationInput,
  MealPreparationReceipt,
} from "@nest/contracts/meal-preparation";
function matchesMealBaseline(
  input: { entryId: string; weekStart: string; expectedRevision: string },
  receipt: { entryId: string; weekStart: string; revision: string },
) {
  return (
    receipt.entryId === input.entryId.toLowerCase() &&
    receipt.weekStart === input.weekStart &&
    receipt.revision === input.expectedRevision
  );
}
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
    matchesMealBaseline(input, receipt) &&
    receipt.dueOn === input.preparation.dueOn
  );
}

export function matchesPreparationEdit(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (
    !Schema.is(EditMealPreparationInput)(input) ||
    !Schema.is(MealPreparationEditReceipt)(receipt)
  )
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    matchesMealBaseline(input, receipt) &&
    receipt.routineId === input.routineId.toLowerCase() &&
    receipt.previousRoutineVersion === input.expectedRoutineVersion &&
    (input.patch.dueOn === undefined || receipt.dueOn === input.patch.dueOn)
  );
}
