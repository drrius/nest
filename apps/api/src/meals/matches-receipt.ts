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
