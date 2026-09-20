import { MoveMealInput, MealMoveReceipt } from "@nest/contracts/meal-move";
import { RemoveMealInput, MealRemovalReceipt } from "@nest/contracts/meal-removal";
import * as Schema from "effect/Schema";
import { PlaceMealInput, MealPlacementReceipt } from "@nest/contracts/meal-placement";
export function matchesMealPlacement(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(PlaceMealInput)(input) || !Schema.is(MealPlacementReceipt)(receipt)) return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.weekStart === input.weekStart &&
    receipt.date === input.date &&
    receipt.slot === input.slot &&
    BigInt(receipt.revision) === BigInt(input.expectedRevision) + 1n
  );
}

export function matchesMealRemoval(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(RemoveMealInput)(input) || !Schema.is(MealRemovalReceipt)(receipt)) return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.entryId === input.entryId.toLowerCase() &&
    receipt.weekStart === input.weekStart &&
    BigInt(receipt.revision) === BigInt(input.expectedRevision) + 1n
  );
}

export function matchesMealMove(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(MoveMealInput)(input) || !Schema.is(MealMoveReceipt)(receipt)) return false;
  return (
    matchesMoveIdentity(input, receipt, member) &&
    receipt.sourceWeekStart === input.sourceWeekStart &&
    receipt.targetWeekStart === input.targetWeekStart &&
    receipt.date === input.date &&
    receipt.slot === input.slot &&
    BigInt(receipt.sourceRevision) === BigInt(input.expectedSourceRevision) + 1n &&
    BigInt(receipt.targetRevision) === BigInt(input.expectedTargetRevision) + 1n
  );
}
function matchesMoveIdentity(
  input: MoveMealInput,
  receipt: MealMoveReceipt,
  member: { userId: string; householdId: string },
) {
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.entryId === input.entryId.toLowerCase()
  );
}
