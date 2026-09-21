import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import { PlaceMealInput, MealPlacementReceipt } from "./meal-placement.ts";
import { SavedMeal } from "./meal-library.ts";
import { PlannedMeal, MealWeekBaseline } from "./meals.ts";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const inWeek = (value: { weekStart: string; date: string }) => {
  const end = new Date(new Date(`${value.weekStart}T00:00:00.000Z`).getTime() + 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  return value.date >= value.weekStart && value.date <= end;
};
const selection = {
  ...Struct.omit(PlaceMealInput.fields, ["title"]),
  definitionId: Uuid,
  expectedLibraryRevision: Revision,
};
export const PlaceRecipeInput = Schema.Struct(selection).check(Schema.makeFilter(inWeek));
export const PlaceRecipe = Schema.Struct({ operationId: Uuid, ...selection }).check(
  Schema.makeFilter(inWeek),
);
export const ReplaceWithRecipeInput = Schema.Struct({ ...selection, entryId: Uuid }).check(
  Schema.makeFilter(inWeek),
  Schema.makeFilter((value) => BigInt(value.expectedRevision) <= 9223372036854775805n),
);
export const ReplaceWithRecipe = Schema.Struct({
  operationId: Uuid,
  ...ReplaceWithRecipeInput.fields,
}).check(
  Schema.makeFilter(inWeek),
  Schema.makeFilter((value) => BigInt(value.expectedRevision) <= 9223372036854775805n),
);
export const RecipePlacementReceipt = Schema.Struct({
  ...MealPlacementReceipt.fields,
  definitionId: Uuid,
  libraryRevision: Revision,
}).check(
  Schema.makeFilter(inWeek),
  Schema.makeFilter((value) => value.revision !== "0"),
);
export const RecipeReplacementReceipt = Schema.Struct({
  ...RecipePlacementReceipt.fields,
  previousEntryId: Uuid,
  skippedPreparationId: Schema.NullOr(Uuid),
}).check(
  Schema.makeFilter(inWeek),
  Schema.makeFilter(
    (value) => BigInt(value.revision) >= 2n && value.entryId !== value.previousEntryId,
  ),
);
export const ReadPlannedRecipe = Schema.Struct({ ...MealWeekBaseline.fields, entryId: Uuid });
export const PlannedRecipeSnapshot = Schema.Struct({
  libraryRevision: Revision,
  recipe: SavedMeal,
});
export const PlannedRecipeEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  ...MealWeekBaseline.fields,
  entry: Schema.NullOr(PlannedMeal),
  snapshot: Schema.NullOr(PlannedRecipeSnapshot),
}).check(
  Schema.makeFilter(
    (value) =>
      value.entry === null || inWeek({ weekStart: value.weekStart, date: value.entry.date }),
  ),
  Schema.makeFilter(
    (value) =>
      value.snapshot === null ||
      (value.entry !== null &&
        value.snapshot.recipe.definitionId === value.entry.definitionId &&
        value.snapshot.recipe.title === value.entry.title &&
        value.snapshot.recipe.recipeUrl === value.entry.recipeUrl &&
        value.snapshot.recipe.notes === value.entry.notes),
  ),
);
export type PlaceRecipeInput = typeof PlaceRecipeInput.Type;
export type PlaceRecipe = typeof PlaceRecipe.Type;
export type ReplaceWithRecipeInput = typeof ReplaceWithRecipeInput.Type;
export type ReplaceWithRecipe = typeof ReplaceWithRecipe.Type;
export type RecipePlacementReceipt = typeof RecipePlacementReceipt.Type;
export type RecipeReplacementReceipt = typeof RecipeReplacementReceipt.Type;
export type ReadPlannedRecipe = typeof ReadPlannedRecipe.Type;
export type PlannedRecipeEnvelope = typeof PlannedRecipeEnvelope.Type;
