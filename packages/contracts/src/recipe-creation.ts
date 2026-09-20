import * as Schema from "effect/Schema";
import { RecipeServings } from "./meal-library.ts";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const RecipeText = (maximum: number) =>
  Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(maximum),
    Schema.makeFilter(
      (value: string) =>
        value.trim().length > 0 && !value.includes("\u0000") && !/[\uD800-\uDFFF]/u.test(value),
    ),
  );
// Only explicit HTTP(S) authorities without credentials, whitespace or backslashes.
// Stored links remain data; the native opener separately parses the URL before opening.
export const RecipeSourceUrl = RecipeText(2000).check(
  Schema.isPattern(/^https?:\/\/[^/?#@\\\s]+(?:[/?#][^\s\\]*)?$(?![\s\S])/i),
  Schema.makeFilter((value: string) =>
    Array.from(value).every(
      (character) =>
        character.charCodeAt(0) > 32 &&
        (character.charCodeAt(0) < 127 || character.charCodeAt(0) > 159),
    ),
  ),
);
export const RecipeIngredientInput = Schema.Struct({
  name: RecipeText(120),
  quantity: Schema.NullOr(RecipeText(80)),
  unit: Schema.NullOr(RecipeText(80)),
  categoryId: Schema.NullOr(Uuid),
  note: Schema.NullOr(RecipeText(1000)),
});
export const RecipeDraft = Schema.Struct({
  title: RecipeText(120),
  servings: RecipeServings,
  instructions: RecipeText(4000),
  recipeUrl: Schema.NullOr(RecipeSourceUrl),
  notes: Schema.NullOr(RecipeText(4000)),
  ingredients: Schema.Array(RecipeIngredientInput).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(200),
  ),
});
const capacity = (input: { expectedRevision: string; recipe: typeof RecipeDraft.Type }) =>
  BigInt(input.expectedRevision) <=
  9223372036854775807n - BigInt(input.recipe.ingredients.length + 1);
export const CreateRecipeInput = Schema.Struct({
  expectedRevision: Revision,
  recipe: RecipeDraft,
}).check(Schema.makeFilter(capacity));
export const CreateRecipe = Schema.Struct({ operationId: Uuid, ...CreateRecipeInput.fields }).check(
  Schema.makeFilter(capacity),
);
export const RecipeCreationReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  definitionId: Uuid,
  revision: Revision,
}).check(Schema.makeFilter((receipt) => BigInt(receipt.revision) >= 2n));
export type CreateRecipeInput = typeof CreateRecipeInput.Type;
export type CreateRecipe = typeof CreateRecipe.Type;
export type RecipeCreationReceipt = typeof RecipeCreationReceipt.Type;
