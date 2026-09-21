import * as Schema from "effect/Schema";
import { RecipeIngredientInput, RecipeText, RecipeSourceUrl } from "./recipe-creation.ts";
import { RecipeServings } from "./meal-library.ts";
import { Revision } from "./revision.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const RecipeMetadataPatch = Schema.Struct({
  title: Schema.optional(RecipeText(120)),
  servings: Schema.optional(Schema.NullOr(RecipeServings)),
  instructions: Schema.optional(Schema.NullOr(RecipeText(4000))),
  recipeUrl: Schema.optional(Schema.NullOr(RecipeSourceUrl)),
  notes: Schema.optional(Schema.NullOr(RecipeText(4000))),
});
export const RecipeIngredientPatch = Schema.Struct({
  name: Schema.optional(RecipeIngredientInput.fields.name),
  quantity: Schema.optional(RecipeIngredientInput.fields.quantity),
  unit: Schema.optional(RecipeIngredientInput.fields.unit),
  categoryId: Schema.optional(RecipeIngredientInput.fields.categoryId),
  note: Schema.optional(RecipeIngredientInput.fields.note),
});
export const RecipeIngredientSelection = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("existing"),
    ingredientId: Uuid,
    patch: RecipeIngredientPatch,
  }),
  Schema.Struct({ kind: Schema.Literal("new"), ...RecipeIngredientInput.fields }),
]);
const Selection = Schema.Array(RecipeIngredientSelection).check(
  Schema.isMaxLength(200),
  Schema.makeFilter((items) => {
    const ids = items.flatMap((item) =>
      item.kind === "existing" ? [item.ingredientId.toLowerCase()] : [],
    );
    return new Set(ids).size === ids.length;
  }),
);
const fields = {
  definitionId: Uuid,
  expectedRevision: Revision,
  patch: RecipeMetadataPatch,
  // null preserves all ingredients; a list explicitly selects their final order.
  ingredients: Schema.NullOr(Selection),
};
const hasChange = (input: {
  patch: typeof RecipeMetadataPatch.Type;
  ingredients: readonly unknown[] | null;
}) => Object.values(input.patch).some((value) => value !== undefined) || input.ingredients !== null;
export const EditRecipeInput = Schema.Struct(fields).check(Schema.makeFilter(hasChange));
export const EditRecipe = Schema.Struct({ operationId: Uuid, ...fields }).check(
  Schema.makeFilter(hasChange),
);
export const RecipeEditReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  definitionId: Uuid,
  previousRevision: Revision,
  revision: Revision,
}).check(
  Schema.makeFilter((receipt) => {
    const difference = BigInt(receipt.revision) - BigInt(receipt.previousRevision);
    return difference >= 0n && difference <= 401n;
  }),
);
export type EditRecipeInput = typeof EditRecipeInput.Type;
export type EditRecipe = typeof EditRecipe.Type;
export type RecipeEditReceipt = typeof RecipeEditReceipt.Type;
