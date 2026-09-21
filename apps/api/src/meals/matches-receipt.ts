import { matchesRecipeSelection } from "./matches-selection.ts";
import { EditRecipeInput, RecipeEditReceipt } from "@nest/contracts/recipe-edit";
import { ArchiveRecipeInput, RecipeArchiveReceipt } from "@nest/contracts/recipe-archive";
import { CreateRecipeInput, RecipeCreationReceipt } from "@nest/contracts/recipe-creation";
import { ReplaceMealInput, MealReplacementReceipt } from "@nest/contracts/meal-replacement";
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

export function matchesMealReplacement(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(ReplaceMealInput)(input) || !Schema.is(MealReplacementReceipt)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.previousEntryId === input.entryId.toLowerCase() &&
    receipt.weekStart === input.weekStart &&
    receipt.date === input.date &&
    receipt.slot === input.slot &&
    BigInt(receipt.revision) === BigInt(input.expectedRevision) + 2n
  );
}

export function matchesMealAction(
  action: string,
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (action === "placeRecipe" || action === "replaceWithRecipe")
    return matchesRecipeSelection(action, input, receipt, member);
  if (action === "editRecipe") return matchesRecipeEdit(input, receipt, member);
  if (action === "archiveRecipe") return matchesRecipeArchive(input, receipt, member);
  if (action === "createRecipe") return matchesRecipeCreation(input, receipt, member);
  if (action === "replaceMeal") return matchesMealReplacement(input, receipt, member);
  if (action === "moveMeal") return matchesMealMove(input, receipt, member);
  if (action === "removeMeal") return matchesMealRemoval(input, receipt, member);
  if (action === "placeMeal") return matchesMealPlacement(input, receipt, member);
  return null;
}

function matchesRecipeCreation(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(CreateRecipeInput)(input) || !Schema.is(RecipeCreationReceipt)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    BigInt(receipt.revision) ===
      BigInt(input.expectedRevision) + BigInt(input.recipe.ingredients.length) + 1n
  );
}

function matchesRecipeArchive(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(ArchiveRecipeInput)(input) || !Schema.is(RecipeArchiveReceipt)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.definitionId === input.definitionId.toLowerCase() &&
    BigInt(receipt.revision) === BigInt(input.expectedRevision) + 1n
  );
}

function matchesRecipeEdit(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(EditRecipeInput)(input) || !Schema.is(RecipeEditReceipt)(receipt)) return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.definitionId === input.definitionId.toLowerCase() &&
    receipt.previousRevision === input.expectedRevision
  );
}
