import * as Schema from "effect/Schema";
import {
  PlaceRecipeInput,
  ReplaceWithRecipeInput,
  RecipePlacementReceipt,
  RecipeReplacementReceipt,
} from "@nest/contracts/recipe-selection";
export function matchesRecipeSelection(
  action: "placeRecipe" | "replaceWithRecipe",
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(PlaceRecipeInput)(input) || !Schema.is(RecipePlacementReceipt)(receipt))
    return false;
  if (
    action === "replaceWithRecipe" &&
    (!Schema.is(ReplaceWithRecipeInput)(input) ||
      !Schema.is(RecipeReplacementReceipt)(receipt) ||
      receipt.previousEntryId !== input.entryId.toLowerCase())
  )
    return false;
  return (
    matchesSelectionBaseline(input, receipt, member) &&
    BigInt(receipt.revision) ===
      BigInt(input.expectedRevision) + (action === "placeRecipe" ? 1n : 2n)
  );
}
function matchesSelectionBaseline(
  input: PlaceRecipeInput,
  receipt: RecipePlacementReceipt,
  member: { userId: string; householdId: string },
) {
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.weekStart === input.weekStart &&
    receipt.date === input.date &&
    receipt.slot === input.slot &&
    receipt.definitionId === input.definitionId.toLowerCase() &&
    receipt.libraryRevision === input.expectedLibraryRevision
  );
}
