import * as Schema from "effect/Schema";
import { StoredMealText, StoredMealTitle } from "./meals.ts";
import { Revision } from "./revision.ts";

const Uuid = Schema.String.check(Schema.isUUID());
export const RecipeServings = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: 2147483647 }),
);
export const ReadMealLibrary = Schema.Struct({
  afterId: Schema.NullOr(Uuid),
  expectedRevision: Schema.NullOr(Revision),
}).check(Schema.makeFilter((input) => input.afterId === null || input.expectedRevision !== null));
export const ReadSavedMeal = Schema.Struct({
  definitionId: Uuid,
  expectedRevision: Revision,
});
export const SavedMealSummary = Schema.Struct({
  definitionId: Uuid,
  title: StoredMealTitle,
  servings: Schema.NullOr(RecipeServings),
});
export const SavedIngredient = Schema.Struct({
  ingredientId: Uuid,
  name: StoredMealTitle,
  quantity: Schema.NullOr(StoredMealText(80)),
  unit: Schema.NullOr(StoredMealText(80)),
  categoryId: Schema.NullOr(Uuid),
  note: Schema.NullOr(StoredMealText(1000)),
  order: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 })),
});
export const SavedMeal = Schema.Struct({
  ...SavedMealSummary.fields,
  recipeUrl: Schema.NullOr(StoredMealText(2000)),
  notes: Schema.NullOr(StoredMealText(4000)),
  instructions: Schema.NullOr(StoredMealText(4000)),
  ingredients: Schema.Array(SavedIngredient).check(Schema.isMaxLength(200)),
}).check(
  Schema.makeFilter((recipe) => {
    const ids = recipe.ingredients.map((item) => item.ingredientId.toLowerCase());
    return (
      new Set(ids).size === ids.length &&
      recipe.ingredients.every(
        (item, index, items) =>
          index === 0 ||
          item.order > items[index - 1]!.order ||
          (item.order === items[index - 1]!.order && ids[index]! > ids[index - 1]!),
      )
    );
  }),
);
const LibraryEnvelope = {
  version: Schema.Literal(1),
  householdId: Uuid,
  revision: Revision,
};
export const MealLibraryPage = Schema.Struct({
  ...LibraryEnvelope,
  meals: Schema.Array(SavedMealSummary).check(Schema.isMaxLength(50)),
  nextAfterId: Schema.NullOr(Uuid),
}).check(
  Schema.makeFilter((page) => {
    const ids = page.meals.map((meal) => meal.definitionId.toLowerCase());
    return (
      ids.every((id, index) => index === 0 || id > ids[index - 1]!) &&
      (page.nextAfterId === null ||
        (ids.length === 50 && page.nextAfterId.toLowerCase() === ids[49]))
    );
  }),
);
export const SavedMealEnvelope = Schema.Struct({
  ...LibraryEnvelope,
  recipe: Schema.NullOr(SavedMeal),
});
export type MealLibraryPage = typeof MealLibraryPage.Type;
export type SavedMealEnvelope = typeof SavedMealEnvelope.Type;
export type SavedMeal = typeof SavedMeal.Type;
